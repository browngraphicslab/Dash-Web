import React = require("react");
import { action, computed, IReactionDisposer, observable } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { emptyFunction, formatTime, OmitKeys, returnFalse, setupMoveUpEvents } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionSubView } from "../collections/CollectionSubView";
import { DocumentView } from "../nodes/DocumentView";
import { LabelBox } from "../nodes/LabelBox";
import "./CollectionStackedTimeline.scss";

type PanZoomDocument = makeInterface<[]>;
const PanZoomDocument = makeInterface();
export type CollectionStackedTimelineProps = {
    duration: number;
    Play: () => void;
    Pause: () => void;
    playLink: (linkDoc: Doc) => void;
    playFrom: (seekTimeInSeconds: number, endTime?: number) => void;
    playing: () => boolean;
    setTime: (time: number) => void;
    isChildActive: () => boolean;
};

@observer
export class CollectionStackedTimeline extends CollectionSubView<PanZoomDocument, CollectionStackedTimelineProps>(PanZoomDocument) {
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;
    static RangePlayScript: ScriptField;
    static LabelPlayScript: ScriptField;

    _disposers: { [name: string]: IReactionDisposer } = {};
    _doubleTime: NodeJS.Timeout | undefined; // bcz: Hack!  this must be called _doubleTime since setupMoveDragEvents will use that field name
    _ele: HTMLAudioElement | null = null;
    _start: number = 0;
    _left: boolean = false;
    _dragging = false;
    _play: any = null;
    _audioRef = React.createRef<HTMLDivElement>();
    _timeline: Opt<HTMLDivElement>;
    _markerStart: number = 0;
    _currAnchor: Opt<Doc>;

    @observable static SelectingRegion: CollectionStackedTimeline | undefined = undefined;
    @observable _markerEnd: number = 0;
    @observable _position: number = 0;
    @computed get anchorDocs() { return this.childDocs; }
    @computed get currentTime() { return NumCast(this.props.Document._currentTimecode); }

    constructor(props: any) {
        super(props);
        // onClick play scripts
        CollectionStackedTimeline.RangeScript = CollectionStackedTimeline.RangeScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.LabelScript = CollectionStackedTimeline.LabelScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.RangePlayScript = CollectionStackedTimeline.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.LabelPlayScript = CollectionStackedTimeline.LabelPlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
    }

    // for creating key anchors with key events
    @action
    keyEvents = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if (!this.props.playing()) return; // can't create if video is not playing
        switch (e.key) {
            case "x": // currently set to x, but can be a different key
                const currTime = this.currentTime;
                if (this._start) {
                    this._markerStart = currTime;
                    // this._start = false;
                    // this._visible = true;
                } else {
                    this.createAnchor(this._markerStart, currTime);
                    // this._start = true;
                    // this._visible = false;
                }
        }
    }

    anchorStart = (anchor: Doc) => NumCast(anchor.anchorStartTime, NumCast(anchor._timecodeToShow, NumCast(anchor.videoStart, NumCast(anchor.audioStart))));
    anchorEnd = (anchor: Doc, val: any = null) => NumCast(anchor.anchorEndTime, NumCast(anchor._timecodeToHide, NumCast(anchor.videoEnd, NumCast(anchor.audioEnd, val))));

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        const linkTime = NumCast(la2.anchorStartTime, NumCast(la1.anchorStartTime));
        if (Doc.AreProtosEqual(la1, this.dataDoc)) {
            la1 = l.anchor2 as Doc;
            la2 = l.anchor1 as Doc;
        }
        return { la1, la2, linkTime };
    }

    // ref for timeline
    timelineRef = (timeline: HTMLDivElement) => {
        this._timeline = timeline;
    }

    // updates the anchor with the new time
    @action
    changeAnchor = (anchor: Opt<Doc>, time: number) => {
        if (anchor) {
            const timelineOnly = Cast(anchor.anchorStartTime, "number", null) !== undefined;
            if (timelineOnly) this._left ? anchor.anchorStartTime = time : anchor.anchorEndTime = time;
            else this._left ? anchor._timecodeToShow = time : anchor._timecodeToHide = time;
        }
    }

    // checks if the two anchors are the same with start and end time
    isSame = (m1: any, m2: any) => {
        return this.anchorStart(m1) === this.anchorStart(m2) && this.anchorEnd(m1) === this.anchorEnd(m2);
    }

    @computed get selectionContainer() {
        return CollectionStackedTimeline.SelectingRegion !== this ? (null) : <div className="audiobox-container" style={{
            left: `${Math.min(NumCast(this._markerStart), NumCast(this._markerEnd)) / this.props.duration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.props.duration * 100}%`, height: "100%", top: "0%"
        }} />;
    }

    // starting the drag event for anchor resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = this._timeline?.getBoundingClientRect();// (e.target as any).getBoundingClientRect();
        if (rect && e.target !== this._audioRef.current && this.props.active()) {
            const wasPlaying = this.props.playing();
            if (wasPlaying) this.props.Pause();
            else if (!this._doubleTime) {
                this._doubleTime = setTimeout(() => {
                    this._doubleTime = undefined;
                    this.props.setTime((e.clientX - rect.x) / rect.width * this.props.duration);
                }, 300);
            }
            this._markerStart = this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
            CollectionStackedTimeline.SelectingRegion = this;
            setupMoveUpEvents(this, e,
                action(e => {
                    this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
                    return false;
                }),
                action((e, movement) => {
                    this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
                    if (this._markerEnd < this._markerStart) {
                        const tmp = this._markerStart;
                        this._markerStart = this._markerEnd;
                        this._markerEnd = tmp;
                    }
                    CollectionStackedTimeline.SelectingRegion === this && (Math.abs(movement[0]) > 15) && this.createAnchor(this._markerStart, this._markerEnd);
                    CollectionStackedTimeline.SelectingRegion = undefined;
                }),
                (e, doubleTap) => {
                    this.props.select(false);
                    e.shiftKey && this.createAnchor(this.currentTime);
                    !wasPlaying && doubleTap && this.props.Play();
                }
                , this.props.isSelected(true) || this.props.isChildActive());
        }
    }

    @action
    createAnchor(anchorStartTime?: number, anchorEndTime?: number) {
        if (anchorStartTime === undefined) return this.props.Document;
        const anchor = Docs.Create.LabelDocument({
            title: ComputedField.MakeFunction(`"#" + formatToTime(self.anchorStartTime) + "-" + formatToTime(self.anchorEndTime)`) as any,
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            anchorStartTime,
            anchorEndTime,
            annotationOn: this.props.Document
        });
        if (Cast(this.dataDoc[this.props.fieldKey], listSpec(Doc), null) !== undefined) {
            Cast(this.dataDoc[this.props.fieldKey], listSpec(Doc), []).push(anchor);
        } else {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([anchor]);
        }
        return anchor;
    }

    @action
    playOnClick = (anchorDoc: Doc, clientX: number) => {
        const seekTimeInSeconds = this.anchorStart(anchorDoc);
        const endTime = this.anchorEnd(anchorDoc);
        if (this.layoutDoc.autoPlay) {
            if (this.props.playing()) this.props.Pause();
            else this.props.playFrom(seekTimeInSeconds, endTime);
        } else {
            if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) && endTime > NumCast(this.layoutDoc._currentTimecode)) {
                if (!this.layoutDoc.autoPlay && this.props.playing()) {
                    this.props.Pause();
                } else {
                    this.props.Play();
                }
            } else {
                this.props.playFrom(seekTimeInSeconds, endTime);
            }
        }
        return { select: true };
    }

    @action
    clickAnchor = (anchorDoc: Doc, clientX: number) => {
        const seekTimeInSeconds = this.anchorStart(anchorDoc);
        const endTime = this.anchorEnd(anchorDoc);
        if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) + 1e-4 && endTime > NumCast(this.layoutDoc._currentTimecode) - 1e-4) {
            if (this.props.playing()) this.props.Pause();
            else if (this.layoutDoc.autoPlay) this.props.Play();
            else if (!this.layoutDoc.autoPlay) {
                const rect = this._timeline?.getBoundingClientRect();
                rect && this.props.setTime(this.toTimeline(clientX - rect.x, rect.width));
            }
        } else {
            if (this.layoutDoc.autoPlay) this.props.playFrom(seekTimeInSeconds, endTime);
            else this.props.setTime(seekTimeInSeconds);
        }
        return { select: true };
    }


    toTimeline = (screen_delta: number, width: number) => Math.max(0, Math.min(this.props.duration, screen_delta / width * this.props.duration));
    // starting the drag event for anchor resizing
    onPointerDown = (e: React.PointerEvent, m: Doc, left: boolean): void => {
        this._currAnchor = m;
        this._left = left;
        this._timeline?.setPointerCapture(e.pointerId);
        setupMoveUpEvents(this, e,
            (e) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.changeAnchor(this._currAnchor, this.toTimeline(e.clientX - rect.x, rect.width));
                return false;
            },
            (e) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.props.setTime(this.toTimeline(e.clientX - rect.x, rect.width));
                this._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }

    rangeClickScript = () => CollectionStackedTimeline.RangeScript;
    labelClickScript = () => CollectionStackedTimeline.LabelScript;
    rangePlayScript = () => CollectionStackedTimeline.RangePlayScript;
    labelPlayScript = () => CollectionStackedTimeline.LabelPlayScript;

    // makes sure no anchors overlaps each other by setting the correct position and width
    getLevel = (m: Doc, placed: { anchorStartTime: number, anchorEndTime: number, level: number }[]) => {
        const timelineContentWidth = this.props.PanelWidth();
        const x1 = this.anchorStart(m);
        const x2 = this.anchorEnd(m, x1 + 10 / timelineContentWidth * this.props.duration);
        let max = 0;
        const overlappedLevels = new Set(placed.map(p => {
            const y1 = p.anchorStartTime;
            const y2 = p.anchorEndTime;
            if ((x1 >= y1 && x1 <= y2) || (x2 >= y1 && x2 <= y2) ||
                (y1 >= x1 && y1 <= x2) || (y2 >= x1 && y2 <= x2)) {
                max = Math.max(max, p.level);
                return p.level;
            }
        }));
        let level = max + 1;
        for (let j = max; j >= 0; j--) !overlappedLevels.has(j) && (level = j);

        placed.push({ anchorStartTime: x1, anchorEndTime: x2, level });
        return level;
    }

    renderInner = computedFn(function (this: CollectionStackedTimeline, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const anchor = observable({ view: undefined as any });
        return {
            anchor, view: <DocumentView key="view"  {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                ref={action((r: DocumentView | null) => anchor.view = r)}
                Document={mark}
                DataDoc={undefined}
                PanelWidth={() => width}
                PanelHeight={() => height}
                renderDepth={this.props.renderDepth + 1}
                focus={() => this.props.playLink(mark)}
                rootSelected={returnFalse}
                LayoutTemplate={undefined}
                LayoutTemplateString={LabelBox.LayoutString("data")}
                ContainingCollectionDoc={this.props.Document}
                removeDocument={this.props.removeDocument}
                ScreenToLocalTransform={() => this.props.ScreenToLocalTransform().translate(-x, -y)}
                parentActive={(out) => this.props.isSelected(out) || this.props.isChildActive()}
                whenActiveChanged={this.props.whenActiveChanged}
                onClick={script}
                onDoubleClick={this.props.Document.autoPlay ? undefined : doublescript}
                ignoreAutoHeight={false}
                hideDecorations={true}
                bringToFront={emptyFunction}
                scriptContext={this} />
        };
    });
    renderAnchor = computedFn(function (this: CollectionStackedTimeline, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const inner = this.renderInner(mark, script, doublescript, x, y, width, height);
        return <>
            {inner.view}
            {!inner.anchor.view || !SelectionManager.IsSelected(inner.anchor.view) ? (null) :
                <>
                    <div key="left" className="left-resizer" onPointerDown={e => this.onPointerDown(e, mark, true)} />
                    <div key="right" className="resizer" onPointerDown={e => this.onPointerDown(e, mark, false)} />
                </>}
        </>;
    });

    render() {
        const timelineContentWidth = this.props.PanelWidth();
        const timelineContentHeight = this.props.PanelHeight();
        const overlaps: { anchorStartTime: number, anchorEndTime: number, level: number }[] = [];
        const drawAnchors = this.anchorDocs.map(anchor => ({ level: this.getLevel(anchor, overlaps), anchor }));
        const maxLevel = overlaps.reduce((m, o) => Math.max(m, o.level), 0) + 2;
        return <div className="audiobox-timeline" style={{ height: "100%", width: "100%" }} ref={this.timelineRef}
            onClick={e => {
                if (this.props.isChildActive() || this.props.isSelected(false)) {
                    e.stopPropagation(); e.preventDefault();
                }
            }}
            onPointerDown={e => {
                if (this.props.isChildActive() || this.props.isSelected(false)) {
                    e.button === 0 && !e.ctrlKey && this.onPointerDownTimeline(e);
                }
            }}>
            {drawAnchors.map(d => {
                const m = d.anchor;
                const start = this.anchorStart(m);
                const end = this.anchorEnd(m, start + 10 / timelineContentWidth * this.props.duration);
                const left = start / this.props.duration * timelineContentWidth;
                const top = d.level / maxLevel * timelineContentHeight;
                const timespan = end - start;
                return this.props.Document.hideAnchors ? (null) :
                    <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}timeline`} key={m[Id]}
                        style={{ left, top, width: `${timespan / this.props.duration * 100}%`, height: `${1 / maxLevel * 100}%` }}
                        onClick={e => { this.props.playFrom(start, this.anchorEnd(m)); e.stopPropagation(); }} >
                        {this.renderAnchor(m, this.rangeClickScript, this.rangePlayScript,
                            left,
                            top,
                            timelineContentWidth * timespan / this.props.duration,
                            timelineContentHeight / maxLevel)}
                    </div>;
            })}
            {this.selectionContainer}
            <div className="audiobox-current" ref={this._audioRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                style={{ left: `${this.currentTime / this.props.duration * 100}%`, pointerEvents: "none" }}
            />
        </div>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });
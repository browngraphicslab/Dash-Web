import React = require("react");
import { action, computed, IReactionDisposer, observable } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { emptyFunction, formatTime, OmitKeys, returnFalse, setupMoveUpEvents } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import "./StackedTimeline.scss";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import { LabelBox } from "./LabelBox";

export interface StackedTimelineProps {
    Document: Doc;
    dataDoc: Doc;
    anchorProps: DocumentViewProps;
    renderDepth: number;
    annotationKey: string;
    duration: number;
    Play: () => void;
    Pause: () => void;
    playLink: (linkDoc: Doc) => void;
    playFrom: (seekTimeInSeconds: number, endTime?: number) => void;
    playing: () => boolean;
    setTime: (time: number) => void;
    select: (ctrlKey: boolean) => void;
    isSelected: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    removeDocument: (doc: Doc | Doc[]) => boolean;
    ScreenToLocalTransform: () => Transform;
    isChildActive: () => boolean;
    active: () => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
}

@observer
export class StackedTimeline extends React.Component<StackedTimelineProps> {
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

    @observable static SelectingRegion: StackedTimeline | undefined = undefined;
    @observable _markerEnd: number = 0;
    @observable _position: number = 0;
    @computed get anchorDocs() { return DocListCast(this.props.dataDoc[this.props.annotationKey]); }
    @computed get currentTime() { return NumCast(this.props.Document._currentTimecode); }

    constructor(props: Readonly<StackedTimelineProps>) {
        super(props);
        // onClick play scripts
        StackedTimeline.RangeScript = StackedTimeline.RangeScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this)`, { self: Doc.name, scriptContext: "any" })!;
        StackedTimeline.LabelScript = StackedTimeline.LabelScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this)`, { self: Doc.name, scriptContext: "any" })!;
        StackedTimeline.RangePlayScript = StackedTimeline.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this)`, { self: Doc.name, scriptContext: "any" })!;
        StackedTimeline.LabelPlayScript = StackedTimeline.LabelPlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this)`, { self: Doc.name, scriptContext: "any" })!;
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

    anchorStart = (anchor: Doc) => NumCast(anchor.anchorStartTime, NumCast(anchor._timecodeToShow, NumCast(anchor.videoStart)))
    anchorEnd = (anchor: Doc, defaultVal: any = null) => NumCast(anchor.anchorEndTime, NumCast(anchor._timecodeToHide, NumCast(anchor.videoEnd, defaultVal)))

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        const linkTime = NumCast(la2.anchorStartTime, NumCast(la1.anchorStartTime));
        if (Doc.AreProtosEqual(la1, this.props.dataDoc)) {
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
        anchor && (this._left ? anchor.anchorStartTime = time : anchor.anchorEndTime = time);
    }

    // checks if the two anchors are the same with start and end time
    isSame = (m1: any, m2: any) => {
        return this.anchorStart(m1) === this.anchorStart(m2) && this.anchorEnd(m1) === this.anchorEnd(m2);
    }

    @computed get selectionContainer() {
        return StackedTimeline.SelectingRegion !== this ? (null) : <div className="audiobox-container" style={{
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
            StackedTimeline.SelectingRegion = this;
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
                    StackedTimeline.SelectingRegion === this && (Math.abs(movement[0]) > 15) && this.createAnchor(this._markerStart, this._markerEnd);
                    StackedTimeline.SelectingRegion = undefined;
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
        if (Cast(this.props.dataDoc[this.props.annotationKey], listSpec(Doc), null) !== undefined) {
            Cast(this.props.dataDoc[this.props.annotationKey], listSpec(Doc), []).push(anchor);
        } else {
            this.props.dataDoc[this.props.annotationKey] = new List<Doc>([anchor]);
        }
        return anchor;
    }

    // play back the audio from time
    @action
    playOnClick = (anchorDoc: Doc) => {
        this.props.playFrom(this.anchorStart(anchorDoc), this.anchorEnd(anchorDoc, this.props.duration));
        return { select: true };
    }

    // play back the audio from time
    @action
    clickAnchor = (anchorDoc: Doc) => {
        if (this.props.Document.autoPlay) return this.playOnClick(anchorDoc);
        this.props.setTime(this.anchorStart(anchorDoc));
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

    rangeClickScript = () => StackedTimeline.RangeScript;
    labelClickScript = () => StackedTimeline.LabelScript;
    rangePlayScript = () => StackedTimeline.RangePlayScript;
    labelPlayScript = () => StackedTimeline.LabelPlayScript;

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

    renderInner = computedFn(function (this: StackedTimeline, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const anchor = observable({ view: undefined as any });
        return {
            anchor, view: <DocumentView key="view"  {...OmitKeys(this.props.anchorProps, ["NativeWidth", "NativeHeight"]).omit}
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
                bringToFront={emptyFunction}
                scriptContext={this} />
        };
    });
    renderAnchor = computedFn(function (this: StackedTimeline, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
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
        </div>
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });
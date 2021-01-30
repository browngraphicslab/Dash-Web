import React = require("react");
import { action, computed, IReactionDisposer, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, Opt, DocListCast } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { emptyFunction, formatTime, OmitKeys, returnFalse, setupMoveUpEvents, StopEvent } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
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
    startTag: string;
    endTag: string;
    fieldKeySuffix?: string;
};

@observer
export class CollectionStackedTimeline extends CollectionSubView<PanZoomDocument, CollectionStackedTimelineProps>(PanZoomDocument) {
    @observable static SelectingRegion: CollectionStackedTimeline | undefined = undefined;
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;
    static RangePlayScript: ScriptField;
    static LabelPlayScript: ScriptField;

    private _timeline: HTMLDivElement | null = null;
    private _markerStart: number = 0;
    @observable _markerEnd: number = 0;

    get duration() { return this.props.duration; }
    @computed get anchorDocs() { return this.props.fieldKeySuffix ? this.childDocs.concat(...DocListCast(this.rootDoc[this.props.fieldKey + this.props.fieldKeySuffix])) : this.childDocs; }
    @computed get currentTime() { return NumCast(this.layoutDoc._currentTimecode); }
    @computed get selectionContainer() {
        return CollectionStackedTimeline.SelectingRegion !== this ? (null) : <div className="collectionStackedTimeline-selector" style={{
            left: `${Math.min(NumCast(this._markerStart), NumCast(this._markerEnd)) / this.duration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.duration * 100}%`
        }} />;
    }

    constructor(props: any) {
        super(props);
        // onClick play scripts
        CollectionStackedTimeline.RangeScript = CollectionStackedTimeline.RangeScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.LabelScript = CollectionStackedTimeline.LabelScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.RangePlayScript = CollectionStackedTimeline.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
        CollectionStackedTimeline.LabelPlayScript = CollectionStackedTimeline.LabelPlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
    }

    componentDidMount() { document.addEventListener("keydown", this.keyEvents, true); }
    componentWillUnmount() {
        document.removeEventListener("keydown", this.keyEvents, true);
        if (CollectionStackedTimeline.SelectingRegion === this) runInAction(() => CollectionStackedTimeline.SelectingRegion = undefined);
    }

    anchorStart = (anchor: Doc) => NumCast(anchor._timecodeToShow, NumCast(anchor[this.props.startTag]));
    anchorEnd = (anchor: Doc, val: any = null) => {
        const endVal = NumCast(anchor[this.props.endTag], val);
        return NumCast(anchor._timecodeToHide, endVal === undefined ? null : endVal);
    }
    toTimeline = (screen_delta: number, width: number) => Math.max(0, Math.min(this.duration, screen_delta / width * this.duration));
    rangeClickScript = () => CollectionStackedTimeline.RangeScript;
    labelClickScript = () => CollectionStackedTimeline.LabelScript;
    rangePlayScript = () => CollectionStackedTimeline.RangePlayScript;
    labelPlayScript = () => CollectionStackedTimeline.LabelPlayScript;

    // for creating key anchors with key events
    @action
    keyEvents = (e: KeyboardEvent) => {
        if (!(e.target instanceof HTMLInputElement) && this.props.isSelected(true)) {
            switch (e.key) {
                case " ":
                    if (!CollectionStackedTimeline.SelectingRegion) {
                        this._markerStart = this._markerEnd = this.currentTime;
                        CollectionStackedTimeline.SelectingRegion = this;
                    } else {
                        CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.props.fieldKey, this.props.startTag, this.props.endTag, this.currentTime);
                        CollectionStackedTimeline.SelectingRegion = undefined;
                    }
            }
        }
    }

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        const linkTime = NumCast(la2[this.props.startTag], NumCast(la1[this.props.startTag]));
        if (Doc.AreProtosEqual(la1, this.dataDoc)) {
            la1 = l.anchor2 as Doc;
            la2 = l.anchor1 as Doc;
        }
        return { la1, la2, linkTime };
    }

    // starting the drag event for anchor resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = this._timeline?.getBoundingClientRect();
        const clientX = e.clientX;
        if (rect && this.props.active()) {
            const wasPlaying = this.props.playing();
            if (wasPlaying) this.props.Pause();
            const wasSelecting = CollectionStackedTimeline.SelectingRegion === this;
            setupMoveUpEvents(this, e,
                action(e => {
                    if (!wasSelecting && CollectionStackedTimeline.SelectingRegion !== this) {
                        this._markerStart = this._markerEnd = this.toTimeline(clientX - rect.x, rect.width);
                        CollectionStackedTimeline.SelectingRegion = this;
                    }
                    this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
                    return false;
                }),
                action((e, movement, isClick) => {
                    this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
                    if (this._markerEnd < this._markerStart) {
                        const tmp = this._markerStart;
                        this._markerStart = this._markerEnd;
                        this._markerEnd = tmp;
                    }
                    if (!isClick) {
                        CollectionStackedTimeline.SelectingRegion === this && (Math.abs(movement[0]) > 15) && CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.props.fieldKey, this.props.startTag, this.props.endTag);
                    }
                    (!isClick || !wasSelecting) && (CollectionStackedTimeline.SelectingRegion = undefined);
                }),
                (e, doubleTap) => {
                    this.props.select(false);
                    e.shiftKey && CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.props.fieldKey, this.props.startTag, this.props.endTag, this.currentTime);
                    !wasPlaying && doubleTap && this.props.Play();
                },
                this.props.isSelected(true) || this.props.isChildActive(), undefined,
                () => !wasPlaying && this.props.setTime((clientX - rect.x) / rect.width * this.duration));
        }
    }

    @undoBatch
    @action
    static createAnchor(rootDoc: Doc, dataDoc: Doc, fieldKey: string, startTag: string, endTag: string, anchorStartTime?: number, anchorEndTime?: number) {
        if (anchorStartTime === undefined) return rootDoc;
        const anchor = Docs.Create.LabelDocument({
            title: ComputedField.MakeFunction(`"#" + formatToTime(self["${startTag}"]) + "-" + formatToTime(self["${endTag}"])`) as any,
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            annotationOn: rootDoc
        });
        Doc.GetProto(anchor)[startTag] = anchorStartTime;
        Doc.GetProto(anchor)[endTag] = anchorEndTime;
        if (Cast(dataDoc[fieldKey], listSpec(Doc), null) !== undefined) {
            Cast(dataDoc[fieldKey], listSpec(Doc), []).push(anchor);
        } else {
            dataDoc[fieldKey] = new List<Doc>([anchor]);
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


    // starting the drag event for anchor resizing
    onAnchorDown = (e: React.PointerEvent, anchor: Doc, left: boolean): void => {
        this._timeline?.setPointerCapture(e.pointerId);
        const newTime = (e: PointerEvent) => {
            const rect = (e.target as any).getBoundingClientRect();
            return this.toTimeline(e.clientX - rect.x, rect.width);
        };
        const changeAnchor = (anchor: Doc, left: boolean, time: number) => {
            const timelineOnly = Cast(anchor[this.props.startTag], "number", null) !== undefined;
            if (timelineOnly) Doc.SetInPlace(anchor, left ? this.props.startTag : this.props.endTag, time, true);
            else left ? anchor._timecodeToShow = time : anchor._timecodeToHide = time;
            return false;
        };
        setupMoveUpEvents(this, e,
            (e) => changeAnchor(anchor, left, newTime(e)),
            (e) => {
                this.props.setTime(newTime(e));
                this._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }

    // makes sure no anchors overlaps each other by setting the correct position and width
    getLevel = (m: Doc, placed: { anchorStartTime: number, anchorEndTime: number, level: number }[]) => {
        const timelineContentWidth = this.props.PanelWidth();
        const x1 = this.anchorStart(m);
        const x2 = this.anchorEnd(m, x1 + 10 / timelineContentWidth * this.duration);
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
                renderDepth={this.props.renderDepth + 1}
                LayoutTemplate={undefined}
                LayoutTemplateString={LabelBox.LayoutString("data")}
                PanelWidth={() => width}
                PanelHeight={() => height}
                ScreenToLocalTransform={() => this.props.ScreenToLocalTransform().translate(-x, -y)}
                focus={() => this.props.playLink(mark)}
                parentActive={out => this.props.isSelected(out) || this.props.isChildActive()}
                rootSelected={returnFalse}
                onClick={script}
                onDoubleClick={this.props.Document.autoPlay ? undefined : doublescript}
                ignoreAutoHeight={false}
                hideResizeHandles={true}
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
                    <div key="left" className="collectionStackedTimeline-left-resizer" onPointerDown={e => this.onAnchorDown(e, mark, true)} />
                    <div key="right" className="collectionStackedTimeline-resizer" onPointerDown={e => this.onAnchorDown(e, mark, false)} />
                </>}
        </>;
    });

    render() {
        const timelineContentWidth = this.props.PanelWidth();
        const timelineContentHeight = this.props.PanelHeight();
        const overlaps: { anchorStartTime: number, anchorEndTime: number, level: number }[] = [];
        const drawAnchors = this.anchorDocs.map(anchor => ({ level: this.getLevel(anchor, overlaps), anchor }));
        const maxLevel = overlaps.reduce((m, o) => Math.max(m, o.level), 0) + 2;
        const isActive = this.props.isChildActive() || this.props.isSelected(false);
        return <div className="collectionStackedTimeline" ref={(timeline: HTMLDivElement | null) => this._timeline = timeline}
            onClick={e => isActive && StopEvent(e)} onPointerDown={e => isActive && this.onPointerDownTimeline(e)}>
            {drawAnchors.map(d => {
                const start = this.anchorStart(d.anchor);
                const end = this.anchorEnd(d.anchor, start + 10 / timelineContentWidth * this.duration);
                const left = start / this.duration * timelineContentWidth;
                const top = d.level / maxLevel * timelineContentHeight;
                const timespan = end - start;
                return this.props.Document.hideAnchors ? (null) :
                    <div className={"collectionStackedTimeline-marker-timeline"} key={d.anchor[Id]}
                        style={{ left, top, width: `${timespan / this.duration * timelineContentWidth}px`, height: `${timelineContentHeight / maxLevel}px` }}
                        onClick={e => { this.props.playFrom(start, this.anchorEnd(d.anchor)); e.stopPropagation(); }} >
                        {this.renderAnchor(d.anchor, this.rangeClickScript, this.rangePlayScript,
                            left,
                            top,
                            timelineContentWidth * timespan / this.duration,
                            timelineContentHeight / maxLevel)}
                    </div>;
            })}
            {this.selectionContainer}
            <div className="collectionStackedTimeline-current" style={{ left: `${this.currentTime / this.duration * 100}%` }} />
        </div>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });
import React = require("react");
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, DocListCast } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { emptyFunction, formatTime, OmitKeys, returnFalse, returnOne, setupMoveUpEvents, StopEvent } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { LinkManager } from "../../util/LinkManager";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { AudioWaveform } from "../AudioWaveform";
import { CollectionSubView } from "../collections/CollectionSubView";
import { LightboxView } from "../LightboxView";
import { DocAfterFocusFunc, DocFocusFunc, DocumentView, DocumentViewProps } from "../nodes/DocumentView";
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
    mediaPath: string;
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
        CollectionStackedTimeline.RangePlayScript = CollectionStackedTimeline.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, scriptContext: "any", clientX: "number" })!;
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
    rangePlayScript = () => CollectionStackedTimeline.RangePlayScript;

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
                    if (!isClick && CollectionStackedTimeline.SelectingRegion === this && (Math.abs(movement[0]) > 15)) {
                        CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.props.fieldKey, this.props.startTag, this.props.endTag,
                            this._markerStart, this._markerEnd);
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
            annotationOn: rootDoc,
            _timelineLabel: true
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
        const seekTimeInSeconds = this.anchorStart(anchorDoc) - 0.25;
        const endTime = this.anchorEnd(anchorDoc);
        if (this.layoutDoc.autoPlayAnchors) {
            if (this.props.playing()) this.props.Pause();
            else this.props.playFrom(seekTimeInSeconds, endTime);
        } else {
            if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) && endTime > NumCast(this.layoutDoc._currentTimecode)) {
                if (!this.layoutDoc.autoPlayAnchors && this.props.playing()) {
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
        if (anchorDoc.isLinkButton) LinkManager.FollowLink(undefined, anchorDoc, this.props, false);
        const seekTimeInSeconds = this.anchorStart(anchorDoc) - 0.25;
        const endTime = this.anchorEnd(anchorDoc);
        if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) + 1e-4 && endTime > NumCast(this.layoutDoc._currentTimecode) - 1e-4) {
            if (this.props.playing()) this.props.Pause();
            else if (this.layoutDoc.autoPlayAnchors) this.props.Play();
            else if (!this.layoutDoc.autoPlayAnchors) {
                const rect = this._timeline?.getBoundingClientRect();
                rect && this.props.setTime(this.toTimeline(clientX - rect.x, rect.width));
            }
        } else {
            if (this.layoutDoc.autoPlayAnchors) this.props.playFrom(seekTimeInSeconds, endTime);
            else this.props.setTime(seekTimeInSeconds);
        }
        return { select: true };
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

    dictationHeight = () => this.props.PanelHeight() / 3;
    timelineContentHeight = () => this.props.PanelHeight() * 2 / 3;
    @computed get renderDictation() {
        const dictation = Cast(this.dataDoc[this.props.fieldKey.replace("annotations", "dictation")], Doc, null);
        return !dictation ? (null) : <div style={{ position: "absolute", height: this.dictationHeight(), top: this.timelineContentHeight(), background: "tan" }}>
            <DocumentView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                Document={dictation}
                PanelHeight={this.dictationHeight}
                isAnnotationOverlay={true}
                select={emptyFunction}
                active={returnFalse}
                scaling={returnOne}
                xMargin={25}
                yMargin={10}
                whenActiveChanged={emptyFunction}
                removeDocument={returnFalse}
                moveDocument={returnFalse}
                addDocument={returnFalse}
                CollectionView={undefined}
                renderDepth={this.props.renderDepth + 1}>
            </DocumentView>
        </div>;
    }
    @computed get renderAudioWaveform() {
        return !this.props.mediaPath ? (null) : <div style={{ position: "absolute", width: "100%", top: 0, left: 0 }}>
            <AudioWaveform
                duration={this.duration}
                mediaPath={this.props.mediaPath}
                dataDoc={this.dataDoc}
                PanelHeight={this.timelineContentHeight} />
        </div>;
    }
    currentTimecode = () => this.currentTime;
    render() {
        const timelineContentWidth = this.props.PanelWidth();
        const overlaps: { anchorStartTime: number, anchorEndTime: number, level: number }[] = [];
        const drawAnchors = this.childDocs.map(anchor => ({ level: this.getLevel(anchor, overlaps), anchor }));
        const maxLevel = overlaps.reduce((m, o) => Math.max(m, o.level), 0) + 2;
        const isActive = this.props.isChildActive() || this.props.isSelected(false);
        return <div className="collectionStackedTimeline" ref={(timeline: HTMLDivElement | null) => this._timeline = timeline}
            onClick={e => isActive && StopEvent(e)} onPointerDown={e => isActive && this.onPointerDownTimeline(e)}>
            {drawAnchors.map(d => {
                const start = this.anchorStart(d.anchor);
                const end = this.anchorEnd(d.anchor, start + 10 / timelineContentWidth * this.duration);
                const left = start / this.duration * timelineContentWidth;
                const top = d.level / maxLevel * this.timelineContentHeight();
                const timespan = end - start;
                return this.props.Document.hideAnchors ? (null) :
                    <div className={"collectionStackedTimeline-marker-timeline"} key={d.anchor[Id]}
                        style={{ left, top, width: `${timespan / this.duration * timelineContentWidth}px`, height: `${this.timelineContentHeight() / maxLevel}px` }}
                        onClick={e => { this.props.playFrom(start, this.anchorEnd(d.anchor)); e.stopPropagation(); }} >
                        <StackedTimelineAnchor {...this.props}
                            mark={d.anchor}
                            rangeClickScript={this.rangeClickScript}
                            rangePlayScript={this.rangePlayScript}
                            left={left}
                            top={top}
                            width={timelineContentWidth * timespan / this.duration}
                            height={this.timelineContentHeight() / maxLevel}
                            toTimeline={this.toTimeline}
                            layoutDoc={this.layoutDoc}
                            currentTimecode={this.currentTimecode}
                            _timeline={this._timeline}
                            stackedTimeline={this}
                        />
                    </div>;
            })}
            {this.selectionContainer}
            {this.renderAudioWaveform}
            {this.renderDictation}

            <div className="collectionStackedTimeline-current" style={{ left: `${this.currentTime / this.duration * 100}%` }} />
        </div>;
    }
}

interface StackedTimelineAnchorProps {
    mark: Doc;
    rangeClickScript: () => ScriptField;
    rangePlayScript: () => ScriptField;
    left: number;
    top: number;
    width: number;
    height: number;
    toTimeline: (screen_delta: number, width: number) => number;
    playLink: (linkDoc: Doc) => void;
    setTime: (time: number) => void;
    isChildActive: () => boolean;
    startTag: string;
    endTag: string;
    renderDepth: number;
    layoutDoc: Doc;
    ScreenToLocalTransform: () => Transform;
    _timeline: HTMLDivElement | null;
    focus: DocFocusFunc;
    currentTimecode: () => number;
    isSelected: (outsideReaction?: boolean) => boolean;
    stackedTimeline: CollectionStackedTimeline;
}
@observer
class StackedTimelineAnchor extends React.Component<StackedTimelineAnchorProps> {
    _lastTimecode: number;
    _disposer: IReactionDisposer | undefined;
    constructor(props: any) {
        super(props);
        this._lastTimecode = this.props.currentTimecode();
    }
    componentDidMount() {
        this._disposer = reaction(() => this.props.currentTimecode(),
            (time) => {
                const dictationDoc = Cast(this.props.layoutDoc["data-dictation"], Doc, null);
                const isDictation = dictationDoc && DocListCast(this.props.mark.links).some(link => Cast(link.anchor1, Doc, null)?.annotationOn === dictationDoc);
                if ((isDictation || !Doc.AreProtosEqual(LightboxView.LightboxDoc, this.props.layoutDoc)) && DocListCast(this.props.mark.links).length &&
                    time > NumCast(this.props.mark[this.props.startTag]) &&
                    time < NumCast(this.props.mark[this.props.endTag]) &&
                    this._lastTimecode < NumCast(this.props.mark[this.props.startTag])) {
                    LinkManager.FollowLink(undefined, this.props.mark, this.props as any as DocumentViewProps, false, true);
                }
                this._lastTimecode = time;
            });
    }
    componentWillUnmount() {
        this._disposer?.();
    }
    // starting the drag event for anchor resizing
    onAnchorDown = (e: React.PointerEvent, anchor: Doc, left: boolean): void => {
        this.props._timeline?.setPointerCapture(e.pointerId);
        const newTime = (e: PointerEvent) => {
            const rect = (e.target as any).getBoundingClientRect();
            return this.props.toTimeline(e.clientX - rect.x, rect.width);
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
                this.props._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }
    renderInner = computedFn(function (this: StackedTimelineAnchor, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const anchor = observable({ view: undefined as any });
        const focusFunc = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc, docTransform?: Transform) => {
            this.props.playLink(mark);
            this.props.focus(doc, { willZoom, scale, afterFocus, docTransform });
        };
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
                focus={focusFunc}
                parentActive={out => this.props.isSelected(out) || this.props.isChildActive()}
                rootSelected={returnFalse}
                onClick={script}
                onDoubleClick={this.props.layoutDoc.autoPlayAnchors ? undefined : doublescript}
                ignoreAutoHeight={false}
                hideResizeHandles={true}
                bringToFront={emptyFunction}
                scriptContext={this.props.stackedTimeline} />
        };
    });
    render() {
        const inner = this.renderInner(this.props.mark, this.props.rangeClickScript, this.props.rangePlayScript, this.props.left, this.props.top, this.props.width, this.props.height);
        return <>
            {inner.view}
            {!inner.anchor.view || !SelectionManager.IsSelected(inner.anchor.view) ? (null) :
                <>
                    <div key="left" className="collectionStackedTimeline-left-resizer" onPointerDown={e => this.onAnchorDown(e, this.props.mark, true)} />
                    <div key="right" className="collectionStackedTimeline-resizer" onPointerDown={e => this.onAnchorDown(e, this.props.mark, false)} />
                </>}
        </>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });
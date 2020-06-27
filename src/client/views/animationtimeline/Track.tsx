import { action, computed, intercept, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast, Opt, DocListCastAsync } from "../../../fields/Doc";
import { Copy } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { ObjectField } from "../../../fields/ObjectField";
import { listSpec } from "../../../fields/Schema";
import { Cast, NumCast, BoolCast } from "../../../fields/Types";
import { Transform } from "../../util/Transform";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
import "./Track.scss";
import { primitive } from "serializr";

interface IProps {
    node: Doc;
    currentBarX: number;
    transform: Transform;
    collection: Doc;
    time: number;
    tickIncrement: number;
    tickSpacing: number;
    timelineVisible: boolean;
    changeCurrentBarX: (x: number) => void;
}

@observer
export class Track extends React.Component<IProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _currentBarXReaction: any;
    @observable private _timelineVisibleReaction: any;
    @observable private _autoKfReaction: any;
    @observable private _newKeyframe: boolean = false;
    private readonly MAX_TITLE_HEIGHT = 75;
    @observable private _trackHeight = 0;

    private defaultTrackedFields = [
        "x",
        "y",
        "_width",
        "_height",
        "opacity",
        "_scrollTop",
        "_panX",
        "_panY",
        "scale"
    ];
    private objectWhitelist = [
        "data"
    ];

    @computed private get regions() { return DocListCast(this.props.node.regions); }
    @computed private get time() { return NumCast(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement)); }

    async componentDidMount() {
        const regions = await DocListCastAsync(this.props.node.regions);
        if (!regions) this.props.node.regions = new List<Doc>(); //if there is no region, then create new doc to store stuff
        //these two lines are exactly same from timeline.tsx 
        const relativeHeight = window.innerHeight / 20;
        runInAction(() => this._trackHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT); //for responsiveness
        this._timelineVisibleReaction = this.timelineVisibleReaction();
        this._currentBarXReaction = this.currentBarXReaction();
        if (DocListCast(this.props.node.regions).length === 0) this.createRegion(this.time);
        this.props.node.hidden = false;
        this.props.node.opacity = 1;
        // this.autoCreateKeyframe();
    }

    /**
     * mainly for disposing reactions
     */
    componentWillUnmount() {
        this._currentBarXReaction?.();
        this._timelineVisibleReaction?.();
        this._autoKfReaction?.();
    }
    ////////////////////////////////


    getLastRegionTime = () => {
        let lastTime: number = 0;
        let lastRegion: Opt<Doc>;
        this.regions.forEach(region => {
            const time = NumCast(region.position);
            if (lastTime <= time) {
                lastTime = time;
                lastRegion = region;
            }
        });
        return lastRegion ? lastTime + NumCast(lastRegion.duration) : 0;
    }

    /**
     * keyframe save logic. Needs to be changed so it's more efficient
     * 
     */
    @action
    saveKeyframe = async () => {
        const keyframes = Cast(this.saveStateRegion?.keyframes, listSpec(Doc)) as List<Doc>;
        const kfIndex = keyframes.indexOf(this.saveStateKf!);
        const kf = keyframes[kfIndex] as Doc; //index in the keyframe
        if (this._newKeyframe) {
            DocListCast(this.saveStateRegion?.keyframes).forEach(kf => {
                this.copyDocDataToKeyFrame(kf);
                // kf.opacity = (index === 0 || index === 3) ? 0.1 : 1;
            });
            this._newKeyframe = false;
        }
        if (!kf) return;
        kf.type === KeyframeFunc.KeyframeType.default && this.copyDocDataToKeyFrame(kf); // only save for non-fades
        keyframes[kfIndex] = kf;
        this.saveStateKf = undefined;
        this.saveStateRegion = undefined;
    }


    /**
     * autocreates keyframe (not currently used)
     */
    @action
    autoCreateKeyframe = (trackedFields: string[]) => {
        const objects = this.objectWhitelist.map(key => this.props.node[key]);
        intercept(this.props.node, change => {
            console.log(change);
            return change;
        });
        return reaction(() => {
            return [...trackedFields.map(key => this.props.node[key]), ...objects];
        }, (changed, reaction) => {
            //check for region 
            const region = this.findRegion(this.time);
            if (region !== undefined) { //if region at scrub time exist
                const r = region as RegionData; //for some region is returning undefined... which is not the case
                if (DocListCast(r.keyframes).find(kf => kf.time === this.time) === undefined) { //basically when there is no additional keyframe at that timespot 
                    this.makeKeyData(r, this.time, KeyframeFunc.KeyframeType.default);
                }
            }
        }, { fireImmediately: false });
    }

    // @observable private _storedState:(Doc | undefined) = undefined; 
    // /**
    //  * reverting back to previous state before editing on AT
    //  */
    // @action
    // revertState = () => {
    //     if (this._storedState) this.applyKeys(this._storedState);
    // }


    /**
     * Reaction when scrubber bar changes
     * made into function so it's easier to dispose later
    */
    @action
    currentBarXReaction = () => {
        console.log("BAR REACTION");
        return reaction(() => this.props.currentBarX, () => {
            const regiondata = this.findRegion(this.time);
            regiondata && this.timeChange();
        });
    }

    /**
     * when timeline is visible, reaction is ran so states are reverted
     */
    @action
    timelineVisibleReaction = () => {
        return reaction(() => {
            return this.props.timelineVisible;
        }, isVisible => {
            if (isVisible) {
                this.regions.filter(region => !region.hasData).forEach(region => {
                    for (let i = 0; i < 4; i++) {
                        this.copyDocDataToKeyFrame(DocListCast(region.keyframes)[i]);
                    }
                });
            } else {
                console.log("reverting state");
                //this.revertState(); 
            }
        });
    }

    @observable private saveStateKf: (Doc | undefined) = undefined;
    @observable private saveStateRegion: (Doc | undefined) = undefined;

    /**w
     * when scrubber position changes. Need to edit the logic
     */
    @action
    timeChange = async () => {
        console.log("TIMECHANGE");
        if (this.saveStateKf !== undefined) {
            await this.saveKeyframe();
        } else if (this._newKeyframe) {
            await this.saveKeyframe();
        }
        const regiondata = await this.findRegion(Math.round(this.time)); //finds a region that the scrubber is on
        if (regiondata) {
            const leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata, this.time); // lef keyframe, if it exists
            const rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata, this.time); //right keyframe, if it exists        
            const currentkf: (Doc | undefined) = await this.calcCurrent(regiondata); //if the scrubber is on top of the keyframe

            if (currentkf) {
                await this.applyKeys(currentkf);
                this.saveStateKf = currentkf;
                this.saveStateRegion = regiondata;
            } else if (leftkf && rightkf) {
                await this.interpolate(leftkf, rightkf);
            }
        }
    }

    /**
     * applying changes (when saving the keyframe) 
     * need to change the logic here
     */
    @action
    private applyKeys = async (kf: Doc) => {
        this.defaultTrackedFields.forEach(key => {
            if (!kf[key]) {
                this.props.node[key] = undefined;
            } else if (BoolCast(kf[key + "Tracked"], true)) { // prob needs fixing for diff scenarios // when first initialized fieldTracked is undefined, so default to true 
                const stored = kf[key];
                this.props.node[key] = stored instanceof ObjectField ? stored[Copy]() : stored;
            }
        });
    }


    /**
     *  calculating current keyframe, if the scrubber is right on the keyframe
     */
    @action
    calcCurrent = (region: Doc) => {
        let currentkf: (Doc | undefined) = undefined;
        const keyframes = DocListCast(region.keyframes!);
        keyframes.forEach((kf) => {
            if (NumCast(kf.time) === Math.round(this.time)) currentkf = kf;
        });
        return currentkf;
    }


    /**
     * basic linear interpolation function 
     * only interpolates field if both left & right doc are tracking the field (might need changing)
     */
    @action
    interpolate = async (left: Doc, right: Doc) => {
        this.defaultTrackedFields.forEach(key => {
            if (BoolCast(left[key + "Tracked"], true) && (BoolCast(right[key + "Tracked"], true))) {
                if (left[key] && right[key] && typeof (left[key]) === "number" && typeof (right[key]) === "number") { //if it is number, interpolate
                    const dif = NumCast(right[key]) - NumCast(left[key]);
                    const deltaLeft = this.time - NumCast(left.time);
                    const ratio = deltaLeft / (NumCast(right.time) - NumCast(left.time));
                    this.props.node[key] = NumCast(left[key]) + (dif * ratio);
                } else { // case data 
                    const stored = left[key];
                    this.props.node[key] = stored instanceof ObjectField ? stored[Copy]() : stored;
                }
            }
        });
    }

    /**
     * finds region that corresponds to specific time (is there a region at this time?)
     * linear O(n) (maybe possible to optimize this with other Data structures?)
     */
    findRegion = (time: number) => {
        return this.regions?.find(rd => (time >= NumCast(rd.position) && time <= (NumCast(rd.position) + NumCast(rd.duration))));
    }


    /**
     * double click on track. Signalling keyframe creation. 
     */
    @action
    onInnerDoubleClick = (e: React.MouseEvent) => {
        const inner = this._inner.current!;
        const offsetX = Math.round((e.clientX - inner.getBoundingClientRect().left) * this.props.transform.Scale);
        this.createRegion(KeyframeFunc.convertPixelTime(offsetX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
    }


    /**
     * creates a region (KEYFRAME.TSX stuff). 
     */
    @action
    createRegion = (time: number) => {
        if (this.findRegion(time) === undefined) {  //check if there is a region where double clicking (prevents phantom regions)
            const regiondata = KeyframeFunc.defaultKeyframe(); //create keyframe data

            regiondata.position = time; //set position
            const rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);

            if (rightRegion && rightRegion.position - regiondata.position <= 4000) { //edge case when there is less than default 4000 duration space between this and right region
                regiondata.duration = rightRegion.position - regiondata.position;
            }
            if (this.regions.length === 0 || !rightRegion || (rightRegion && rightRegion.position - regiondata.position >= 0)) {
                Cast(this.props.node.regions, listSpec(Doc))?.push(regiondata);
                this._newKeyframe = true;
                this.saveStateRegion = regiondata;
                return regiondata;
            }
        }
    }

    @action
    makeKeyData = (regiondata: RegionData, time: number, type: KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        console.log("MAKEKEYDATA");
        const trackKeyFrames = DocListCast(regiondata.keyframes);
        const existingkf = trackKeyFrames.find(TK => TK.time === time);
        if (existingkf) return existingkf;
        //else creates a new doc. 
        const newKeyFrame: Doc = new Doc();
        newKeyFrame.time = time;
        newKeyFrame.type = type;
        this.copyDocDataToKeyFrame(newKeyFrame);
        //assuming there are already keyframes (for keeping keyframes in order, sorted by time)
        if (trackKeyFrames.length === 0) { regiondata.keyframes!.push(newKeyFrame); console.log("added, only keyframe"); }
        trackKeyFrames.map(kf => NumCast(kf.time)).forEach((kfTime, index) => {
            if (index === 0 && time < kfTime) { // if newKeyFrame is leftmost keyframe
                regiondata.keyframes!.unshift(newKeyFrame);
            } else if ((index === trackKeyFrames.length - 1 && kfTime < time) || (kfTime < time && time < NumCast(trackKeyFrames[index + 1].time))) { // if newKeyFrame is rightmost keyframe, or in between keyframes
                console.log("added to index ", index);
                regiondata.keyframes!.splice(index + 1, 0, newKeyFrame);
            }
        });
        return newKeyFrame;
    }

    @action
    copyDocDataToKeyFrame = (doc: Doc, ) => {
        console.log("copyDocDataToKeyFrame");
        this.defaultTrackedFields.map(key => {
            const fieldTracked = BoolCast(doc[key + "Tracked"], true); // when first initialized `{field}Tracked` is undefined, so default to true 
            if (fieldTracked) {
                const originalVal = this.props.node[key];
                doc[key] = originalVal instanceof ObjectField ? originalVal[Copy]() : originalVal;
            }
        });
    }

    /**
     * UI sstuff here. Not really much to change
     */
    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} style={{ height: `${this._trackHeight}px` }}
                        onDoubleClick={this.onInnerDoubleClick}
                        onPointerOver={() => Doc.BrushDoc(this.props.node)}
                        onPointerOut={() => Doc.UnBrushDoc(this.props.node)} >
                        {this.regions?.map((region, i) => {
                            return <Keyframe key={`${i}`} {...this.props} RegionData={region} makeKeyData={this.makeKeyData} defaultTrackedFields={this.defaultTrackedFields} currentBarX={this.props.currentBarX} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
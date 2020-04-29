import { action, computed, intercept, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast, Opt, DocListCastAsync } from "../../../new_fields/Doc";
import { Copy } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, NumCast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
import "./Track.scss";

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
    private _trackHeight = 0;
    private primitiveWhitelist = [
        "x",
        "y",
        "_width",
        "_height",
        "opacity",
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
        this._trackHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT; //for responsiveness
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
        let keyframes = Cast(this.saveStateRegion?.keyframes, listSpec(Doc)) as List<Doc>;
        let kfIndex = keyframes.indexOf(this.saveStateKf!);
        let kf = keyframes[kfIndex] as Doc; //index in the keyframe
        if (this._newKeyframe) {
            DocListCast(this.saveStateRegion?.keyframes).forEach((kf, index) => {
                this.copyDocDataToKeyFrame(kf);
                kf.opacity = (index === 0 || index === 3) ? 0.1 : 1;
            });
            this._newKeyframe = false;
        }
        if (!kf) return;
        if (kf.type === KeyframeFunc.KeyframeType.default) { // only save for non-fades
            this.copyDocDataToKeyFrame(kf);
            let leftkf = KeyframeFunc.calcMinLeft(this.saveStateRegion!, this.time, kf); // lef keyframe, if it exists
            let rightkf = KeyframeFunc.calcMinRight(this.saveStateRegion!, this.time, kf); //right keyframe, if it exists 
            if (leftkf?.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                let edge = KeyframeFunc.calcMinLeft(this.saveStateRegion!, this.time, leftkf);
                edge && this.copyDocDataToKeyFrame(edge);
                leftkf && this.copyDocDataToKeyFrame(leftkf);
                edge && (edge!.opacity = 0.1);
                leftkf && (leftkf!.opacity = 1);
            }
            if (rightkf?.type === KeyframeFunc.KeyframeType.fade) {
                let edge = KeyframeFunc.calcMinRight(this.saveStateRegion!, this.time, rightkf);
                edge && this.copyDocDataToKeyFrame(edge);
                rightkf && this.copyDocDataToKeyFrame(rightkf);
                edge && (edge.opacity = 0.1);
                rightkf && (rightkf.opacity = 1);
            }
        }
        keyframes[kfIndex] = kf;
        this.saveStateKf = undefined;
        this.saveStateRegion = undefined;
    }


    /**
     * autocreates keyframe
     */
    @action
    autoCreateKeyframe = () => {
        const objects = this.objectWhitelist.map(key => this.props.node[key]);
        intercept(this.props.node, change => {
            console.log(change);
            return change;
        });
        return reaction(() => {
            return [...this.primitiveWhitelist.map(key => this.props.node[key]), ...objects];
        }, (changed, reaction) => {
            //check for region 
            const region = this.findRegion(this.time);
            if (region !== undefined) { //if region at scrub time exist
                let r = region as RegionData; //for some region is returning undefined... which is not the case
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
        return reaction(() => this.props.currentBarX, () => {
            const regiondata = this.findRegion(this.time);
            if (regiondata) {
                this.props.node.hidden = false;
                // if (!this._autoKfReaction) {
                //     // console.log("creating another reaction"); 
                //     // this._autoKfReaction = this.autoCreateKeyframe(); 
                // }
                this.timeChange();
            } else {
                this.props.node.hidden = true;
                this.props.node.opacity = 0;
                //if (this._autoKfReaction) this._autoKfReaction(); 
            }
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
                        if (i === 0 || i === 3) { //manually inputing fades
                            DocListCast(region.keyframes)[i].opacity = 0.1;
                        }
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
        if (this.saveStateKf !== undefined) {
            await this.saveKeyframe();
        } else if (this._newKeyframe) {
            await this.saveKeyframe();
        }
        let regiondata = await this.findRegion(Math.round(this.time)); //finds a region that the scrubber is on
        if (regiondata) {
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata, this.time); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata, this.time); //right keyframe, if it exists        
            let currentkf: (Doc | undefined) = await this.calcCurrent(regiondata); //if the scrubber is on top of the keyframe
            if (currentkf) {
                console.log("is current");
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
        this.primitiveWhitelist.forEach(key => {
            if (!kf[key]) {
                this.props.node[key] = undefined;
            } else {
                let stored = kf[key];
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
        let keyframes = DocListCast(region.keyframes!);
        keyframes.forEach((kf) => {
            if (NumCast(kf.time) === Math.round(this.time)) currentkf = kf;
        });
        return currentkf;
    }


    /**
     * basic linear interpolation function 
     */
    @action
    interpolate = async (left: Doc, right: Doc) => {
        this.primitiveWhitelist.forEach(key => {
            if (left[key] && right[key] && typeof (left[key]) === "number" && typeof (right[key]) === "number") { //if it is number, interpolate
                let dif = NumCast(right[key]) - NumCast(left[key]);
                let deltaLeft = this.time - NumCast(left.time);
                let ratio = deltaLeft / (NumCast(right.time) - NumCast(left.time));
                this.props.node[key] = NumCast(left[key]) + (dif * ratio);
            } else { // case data 
                let stored = left[key];
                this.props.node[key] = stored instanceof ObjectField ? stored[Copy]() : stored;
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
        let inner = this._inner.current!;
        let offsetX = Math.round((e.clientX - inner.getBoundingClientRect().left) * this.props.transform.Scale);
        this.createRegion(KeyframeFunc.convertPixelTime(offsetX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
    }


    /**
     * creates a region (KEYFRAME.TSX stuff). 
     */
    @action
    createRegion = (time: number) => {
        if (this.findRegion(time) === undefined) {  //check if there is a region where double clicking (prevents phantom regions)
            let regiondata = KeyframeFunc.defaultKeyframe(); //create keyframe data

            regiondata.position = time; //set position
            let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);

            if (rightRegion && rightRegion.position - regiondata.position <= 4000) { //edge case when there is less than default 4000 duration space between this and right region
                regiondata.duration = rightRegion.position - regiondata.position;
            }
            if (this.regions.length === 0 || !rightRegion || (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))) {
                Cast(this.props.node.regions, listSpec(Doc))?.push(regiondata);
                this._newKeyframe = true;
                this.saveStateRegion = regiondata;
                return regiondata;
            }
        }
    }

    @action
    makeKeyData = (regiondata: RegionData, time: number, type: KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        const trackKeyFrames = DocListCast(regiondata.keyframes)!;
        const existingkf = trackKeyFrames.find(TK => TK.time === time);
        if (existingkf) return existingkf;
        //else creates a new doc. 
        const newKeyFrame: Doc = new Doc();
        newKeyFrame.time = time;
        newKeyFrame.type = type;
        this.copyDocDataToKeyFrame(newKeyFrame);
        //assuming there are already keyframes (for keeping keyframes in order, sorted by time)
        if (trackKeyFrames.length === 0) regiondata.keyframes!.push(newKeyFrame);
        trackKeyFrames.map(kf => NumCast(kf.time)).forEach((kfTime, index) => {
            if ((kfTime < time && index === trackKeyFrames.length - 1) || (kfTime < time && time < NumCast(trackKeyFrames[index + 1].time))) {
                regiondata.keyframes!.splice(index + 1, 0, newKeyFrame);
            }
        });
        return newKeyFrame;
    }

    @action
    copyDocDataToKeyFrame = (doc: Doc) => {
        this.primitiveWhitelist.map(key => {
            const originalVal = this.props.node[key];
            doc[key] = originalVal instanceof ObjectField ? originalVal[Copy]() : originalVal;
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
                            return <Keyframe key={`${i}`} {...this.props} RegionData={region} makeKeyData={this.makeKeyData} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
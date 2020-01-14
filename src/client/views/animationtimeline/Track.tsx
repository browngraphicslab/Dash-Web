import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, computed, runInAction, autorun , toJS, isObservableArray, IObservableArray} from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast, Field } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast, StrCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
import { Transform } from "../../util/Transform";
import { Copy } from "../../../new_fields/FieldSymbols";
import { ObjectField } from "../../../new_fields/ObjectField";

interface IProps {
    node: Doc;
    currentBarX: number;
    transform: Transform;
    collection: Doc;
    time: number;
    tickIncrement: number;
    tickSpacing: number;
    timelineVisible: boolean;
    check: string;
    changeCurrentBarX: (x: number) => void;
}

@observer
export class Track extends React.Component<IProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _currentBarXReaction: any;
    @observable private _timelineVisibleReaction: any;
    @observable private _isOnKeyframe: boolean = false;
    @observable private _onKeyframe: (Doc | undefined) = undefined;
    @observable private _onRegionData: (Doc | undefined) = undefined;
    @observable private _storedState: (Doc | undefined) = undefined;
    @observable private filterList = [
        "regions",
        "cursors",
        "hidden",
        "nativeHeight",
        "nativeWidth",
        "schemaColumns",
        "baseLayout",
        "backgroundLayout",
        "layout",
        "title", 
        "AnimationLength", 
        "author", 
        "baseProto", 
        "creationDate", 
        "isATOn", 
        "isPrototype", 
        "lastOpened", 
        "proto", 
        "type", 
        "zIndex"
    ];

    private readonly MAX_TITLE_HEIGHT = 75; 
    private _trackHeight = 0;

    @computed private get regions() { return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>; }

    ////////// life cycle functions///////////////
    componentWillMount() {
        runInAction(() => {
            if (!this.props.node.regions) this.props.node.regions = new List<Doc>(); //if there is no region, then create new doc to store stuff
            //these two lines are exactly same from timeline.tsx 
            let relativeHeight = window.innerHeight / 14;
            this._trackHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT; //for responsiveness
        });
    }

    componentDidMount() {
        runInAction(async () => {
            this._timelineVisibleReaction = this.timelineVisibleReaction();
            this._currentBarXReaction = this.currentBarXReaction();
            if (this.regions.length === 0) this.createRegion(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            this.props.node.hidden = false;
            this.props.node.opacity = 1;
            this.autoCreateKeyframe(); 
        });
    }

    /**
     * mainly for disposing reactions
     */
    componentWillUnmount() {
        runInAction(() => {
            //disposing reactions 
            if (this._currentBarXReaction) this._currentBarXReaction();
            if (this._timelineVisibleReaction) this._timelineVisibleReaction();
        });
    }
    ////////////////////////////////

    /**
     * keyframe save logic. Needs to be changed so it's more efficient
     * 
     */
    @action
    saveKeyframe = async (ref: Doc, regiondata: Doc) => {
        let keyframes: List<Doc> = (Cast(regiondata.keyframes, listSpec(Doc)) as List<Doc>);
        let kfIndex: number = keyframes.indexOf(ref);
        let kf = keyframes[kfIndex] as Doc;
        if (!kf) return;
        if (kf.type === KeyframeFunc.KeyframeType.default) { // only save for non-fades
            kf.key = Doc.MakeCopy(this.props.node, true);
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), kf); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), kf); //right keyframe, if it exists 
            if (leftkf!.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                let edge: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), leftkf!);
                edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
            }
            if (rightkf!.type === KeyframeFunc.KeyframeType.fade) {
                let edge: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), rightkf!);
                edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                rightkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                (Cast(rightkf!.key, Doc)! as Doc).opacity = 1;
            }
        }
        keyframes[kfIndex] = kf;
        this._onKeyframe = undefined;
        this._onRegionData = undefined;
        this._isOnKeyframe = false;
    }


    private whitelist = [
        "x", 
        "y", 
        "width", 
        "height", 
        "data"
    ]
    /**
     * autocreates keyframe
     */
    @action 
    autoCreateKeyframe = async () => {        
        return reaction(async () => {
            return this.whitelist.map(key => this.props.node[key]);
        }, (changed, reaction) => {            
            //convert scrubber pos(pixel) to time
            let time = KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement); 
            //check for region 
            //let region:(Doc | undefined) = await this.findRegion(time); 
            console.log(this.props.node.x);
            console.log(this.props.node.y); 
            console.log(changed);  
            
            // if (region !== undefined){ //if region at scrub time exist
            //     if (DocListCast(region!.keyframes).find(kf => {return kf.time === time}) === undefined ){
            //        console.log("change has occured");
            //     } 
            // }
            //reaction.dispose(); 
        });
        
    }

    /**
     * reverting back to previous state before editing on AT
     */
    @action
    revertState = () => {
        let copyDoc = Doc.MakeCopy(this.props.node, true);
        if (this._storedState) this.applyKeys(this._storedState);
        let newState = new Doc();
        newState.key = copyDoc;
        this._storedState = newState;
    }

    /**
     * Reaction when scrubber bar changes
     * made into function so it's easier to dispose later
    */
    @action
    currentBarXReaction = () => {
        return reaction(() => this.props.currentBarX, async () => {
            let regiondata: (Doc | undefined) = await this.findRegion(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            if (regiondata) {
                this.props.node.hidden = false;
                //await this.timeChange(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            } else {
                this.props.node.hidden = true;
                this.props.node.opacity = 0;
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
            this.revertState();
            if (isVisible){
                DocListCast(this.regions).forEach(region => {
                    if (!BoolCast((Cast(region, Doc) as Doc).hasData)){
                        for (let i = 0; i < 4; i++){
                            DocListCast(((Cast(region, Doc) as Doc).keyframes as List<Doc>))[i].key = Doc.MakeCopy(this.props.node, true); 
                            if (i === 0 || i === 3){
                                DocListCast(((Cast(region, Doc) as Doc).keyframes as List<Doc>))[i].key.opacity = 0.1;
                            }
                        }
                        console.log("saving keyframes"); 
                    }
                }); 
            }
        });
    }

    /**w
     * when scrubber position changes. Need to edit the logic
     */
    @action
    timeChange = async (time: number) => {
        if (this._isOnKeyframe && this._onKeyframe && this._onRegionData) {
            await this.saveKeyframe(this._onKeyframe, this._onRegionData);
        }
        let regiondata = await this.findRegion(Math.round(time)); //finds a region that the scrubber is on
        if (regiondata) {
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement)); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement)); //right keyframe, if it exists            
            let currentkf: (Doc | undefined) = await this.calcCurrent(regiondata); //if the scrubber is on top of the keyframe
            if (currentkf) {
                await this.applyKeys(currentkf);
                this._isOnKeyframe = true;
                this._onKeyframe = currentkf;
                this._onRegionData = regiondata;
            } else if (leftkf && rightkf) {
                await this.interpolate(leftkf, rightkf, regiondata);
            }
        }
    }

    /**
     * applying changes (when saving the keyframe) 
     * need to change the logic here
     */
    @action
    private applyKeys = async (kf: Doc) => {
        let kfNode = await Cast(kf.key, Doc) as Doc;
        let docFromApply = kfNode;
        if (this.filterKeys(Doc.allKeys(this.props.node)).length > this.filterKeys(Doc.allKeys(kfNode)).length) docFromApply = this.props.node;
        this.filterKeys(Doc.allKeys(docFromApply)).forEach(key => {
            if (!kfNode[key]) {
                this.props.node[key] = undefined;
            } else {
                let stored = kfNode[key];
                if (stored instanceof ObjectField) {
                    this.props.node[key] = stored[Copy]();
                } else {
                    this.props.node[key] = stored;
                }
            }
        });
    }



    /**
     * changing the filter here 
     */
    @action
    private filterKeys = (keys: string[]): string[] => {
        return keys.reduce((acc: string[], key: string) => {
            if (!this.filterList.includes(key)) acc.push(key);
            return acc;
        }, []);
    }


    /**
     *  calculating current keyframe, if the scrubber is right on the keyframe
     */
    @action
    calcCurrent = async (region: Doc) => {
        let currentkf: (Doc | undefined) = undefined;
        let keyframes = await DocListCastAsync(region.keyframes!);
        keyframes!.forEach((kf) => {
            if (NumCast(kf.time) === Math.round(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement))) currentkf = kf;
        });
        return currentkf;
    }


    /**
     * interpolation. definetely needs to be changed. (currently involves custom linear splicing interpolations). 
     * Too complex right now. Also need to apply quadratic spline later on (for smoothness, instead applying "gains")
     */
    @action
    interpolate = async (left: Doc, right: Doc, regiondata: Doc) => {
        let leftNode = left.key as Doc;
        let rightNode = right.key as Doc;
        const dif_time = NumCast(right.time) - NumCast(left.time);
        const timeratio = (KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement) - NumCast(left.time)) / dif_time; //linear 
        let keyframes = (await DocListCastAsync(regiondata.keyframes!))!;
        let indexLeft = keyframes.indexOf(left);
        let interY: List<number> = (await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).interpolationY as List<number>)!;
        let realIndex = (interY.length - 1) * timeratio;
        let xIndex = Math.floor(realIndex);
        let yValue = interY[xIndex];
        let secondYOffset: number = yValue;
        let minY = interY[0];  // for now
        let maxY = interY[interY.length - 1]; //for now 
        if (interY.length !== 1) {
            secondYOffset = interY[xIndex] + ((realIndex - xIndex) / 1) * (interY[xIndex + 1] - interY[xIndex]) - minY;
        }
        let finalRatio = secondYOffset / (maxY - minY);
        let pathX: List<number> = await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).pathX as List<number>;
        let pathY: List<number> = await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).pathY as List<number>;
        let proposedX = 0;
        let proposedY = 0;
        if (pathX.length !== 0) {
            let realPathCorrespondingIndex = finalRatio * (pathX.length - 1);
            let pathCorrespondingIndex = Math.floor(realPathCorrespondingIndex);
            if (pathCorrespondingIndex >= pathX.length - 1) {
                proposedX = pathX[pathX.length - 1];
                proposedY = pathY[pathY.length - 1];
            } else if (pathCorrespondingIndex < 0) {
                proposedX = pathX[0];
                proposedY = pathY[0];
            } else {
                proposedX = pathX[pathCorrespondingIndex] + ((realPathCorrespondingIndex - pathCorrespondingIndex) / 1) * (pathX[pathCorrespondingIndex + 1] - pathX[pathCorrespondingIndex]);
                proposedY = pathY[pathCorrespondingIndex] + ((realPathCorrespondingIndex - pathCorrespondingIndex) / 1) * (pathY[pathCorrespondingIndex + 1] - pathY[pathCorrespondingIndex]);
            }

        }
        this.filterKeys(Doc.allKeys(leftNode)).forEach(key => {
            if (leftNode[key] && rightNode[key] && typeof (leftNode[key]) === "number" && typeof (rightNode[key]) === "number") { //if it is number, interpolate
                if ((key === "x" || key === "y") && pathX.length !== 0) {
                    if (key === "x") this.props.node[key] = proposedX;
                    if (key === "y") this.props.node[key] = proposedY;
                } else {
                    const diff = NumCast(rightNode[key]) - NumCast(leftNode[key]);
                    const adjusted = diff * finalRatio;
                    this.props.node[key] = NumCast(leftNode[key]) + adjusted;
                }
            } else {
                let stored = leftNode[key];
                if (stored instanceof ObjectField) {
                    this.props.node[key] = stored[Copy]();
                } else {
                    this.props.node[key] = stored;
                }
            }
        });
    }

    /**
     * finds region that corresponds to specific time (is there a region at this time?)
     * linear O(n) (maybe possible to optimize this with other Data structures?)
     */
    @action
    findRegion = async (time: number) => {
        let foundRegion: (Doc | undefined) = undefined;
        let regions = await DocListCastAsync(this.regions);
        regions!.forEach(region => {
            region = region as RegionData;
            if (time >= NumCast(region.position) && time <= (NumCast(region.position) + NumCast(region.duration))) {
                foundRegion = region;
            }
        });
        return foundRegion;
    }


    /**
     * double click on track. Signalling keyframe creation. Problem with phantom regions
     */
    @action
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!;
        let offsetX = Math.round((e.clientX - inner.getBoundingClientRect().left) * this.props.transform.Scale);
        this.createRegion(KeyframeFunc.convertPixelTime(offsetX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
        this.forceUpdate();
    }


    /**
     * creates a region (KEYFRAME.TSX stuff). 
     */
    createRegion = async (time: number) => {
        if (await this.findRegion(time) === undefined){  //check if there is a region where double clicking (prevents phantom regions)
            let regiondata = KeyframeFunc.defaultKeyframe(); //create keyframe data
            regiondata.position = time; //set position
            let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);
    
            if (rightRegion && rightRegion.position - regiondata.position <= 4000) { //edge case when there is less than default 4000 duration space between this and right region
                regiondata.duration = rightRegion.position - regiondata.position;
            }
            if (this.regions.length === 0 || !rightRegion || (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))) {
                this.regions.push(regiondata);
                return regiondata;
            }
        }
    }


    /**
     * UI sstuff here. Not really much to change
     */
    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick} onPointerOver={() => { Doc.BrushDoc(this.props.node); }} onPointerOut={() => { Doc.UnBrushDoc(this.props.node); }} style={{ height: `${this._trackHeight}px` }}>
                        {DocListCast(this.regions).map((region) => {
                            return <Keyframe {...this.props} RegionData={region} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, computed, runInAction, autorun, toJS, isObservableArray, IObservableArray, trace, observe, intercept } from "mobx";
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
        "width",
        "height",
        "opacity", 
    ];
    private objectWhitelist = [
        "data"
    ];

    @computed private get regions() { return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>; }
    @computed private get time() { return NumCast(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement)); }

    ////////// life cycle functions///////////////
    componentWillMount() {
        runInAction(() => {
            if (!this.props.node.regions) this.props.node.regions = new List<Doc>(); //if there is no region, then create new doc to store stuff
            //these two lines are exactly same from timeline.tsx 
            let relativeHeight = window.innerHeight / 20;
            this._trackHeight = relativeHeight < this.MAX_TITLE_HEIGHT ? relativeHeight : this.MAX_TITLE_HEIGHT; //for responsiveness
        });
    }

    componentDidMount() {
        runInAction(async () => {
            this._timelineVisibleReaction = this.timelineVisibleReaction();
            this._currentBarXReaction = this.currentBarXReaction();
            if (this.regions.length === 0) this.createRegion(this.time);
            this.props.node.hidden = false;
            this.props.node.opacity = 1;
            // this.autoCreateKeyframe();
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
            if (this._autoKfReaction) this._autoKfReaction();
        });
    }
    ////////////////////////////////


    getLastRegion = () => {

        console.log((this.regions[this.regions.length - 1] as Doc).time); 
        return this.regions[this.regions.length - 1] as Doc; 
    }

    /**
     * keyframe save logic. Needs to be changed so it's more efficient
     * 
     */
    @action
    saveKeyframe = async () => {
        console.log("saving keyframe");
        let keyframes: List<Doc> = (Cast(this.saveStateRegion!.keyframes, listSpec(Doc)) as List<Doc>);
        let kfIndex: number = keyframes.indexOf(this.saveStateKf!);
        let kf = keyframes[kfIndex] as Doc; //index in the keyframe
        if (this._newKeyframe) {
            console.log("new keyframe registering");
            let kfList = DocListCast(this.saveStateRegion!.keyframes); 
            kfList.forEach(kf => {
                kf.key = this.makeCopy(); 
                if (kfList.indexOf(kf) === 0  ||  kfList.indexOf(kf) === 3){
                    (kf.key as Doc).opacity = 0.1; 
                } else{
                    (kf.key as Doc).opacity = 1; 
                }
            });
            this._newKeyframe = false; 
        }
        if (!kf) return;
        if (kf.type === KeyframeFunc.KeyframeType.default) { // only save for non-fades
            kf.key = this.makeCopy();
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(this.saveStateRegion!, this.time, kf); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(this.saveStateRegion!, this.time, kf); //right keyframe, if it exists 
            if (leftkf!.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                let edge: (Doc | undefined) = await KeyframeFunc.calcMinLeft(this.saveStateRegion!, this.time, leftkf!);
                edge!.key = this.makeCopy();
                leftkf!.key = this.makeCopy();
                (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
            }
            if (rightkf!.type === KeyframeFunc.KeyframeType.fade) {
                let edge: (Doc | undefined) = await KeyframeFunc.calcMinRight(this.saveStateRegion!, this.time, rightkf!);
                edge!.key = this.makeCopy();
                rightkf!.key = this.makeCopy();
                (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                (Cast(rightkf!.key, Doc)! as Doc).opacity = 1;
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
        const { node } = this.props;
        const objects = this.objectWhitelist.map(key => node[key]);
        intercept(this.props.node, change => {
            console.log(change);
            return change;
        });
        return reaction(() => {
            return [...this.primitiveWhitelist.map(key => node[key]), ...objects];
        }, (changed, reaction) => {
            //check for region 
            this.findRegion(this.time).then((region) => {
                if (region !== undefined) { //if region at scrub time exist
                    let r = region as any as RegionData; //for some region is returning undefined... which is not the case
                    if (DocListCast(r.keyframes).find(kf => kf.time === this.time) === undefined) { //basically when there is no additional keyframe at that timespot 
                        this.makeKeyData(r, this.time, KeyframeFunc.KeyframeType.default);
                    }
                }
            });
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
            this.findRegion(this.time).then((regiondata: (Doc | undefined)) => {
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
                DocListCast(this.regions).forEach(region => {
                    if (!BoolCast((Cast(region, Doc) as Doc).hasData)) {
                        for (let i = 0; i < 4; i++) {
                            DocListCast(((Cast(region, Doc) as Doc).keyframes as List<Doc>))[i].key = this.makeCopy();
                            if (i === 0 || i === 3) { //manually inputing fades
                                (DocListCast(((Cast(region, Doc) as Doc).keyframes as List<Doc>))[i].key! as Doc).opacity = 0.1;
                            }
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
        } else if (this._newKeyframe){
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
        let kfNode = await Cast(kf.key, Doc) as Doc;
        this.primitiveWhitelist.forEach(key => {
            if (!kfNode[key]) {
                this.props.node[key] = undefined;
            } else {
                let stored = kfNode[key];
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
        let leftNode = await (left.key) as Doc;
        let rightNode = await (right.key) as Doc;
        this.primitiveWhitelist.forEach(key => {
            if (leftNode[key] && rightNode[key] && typeof (leftNode[key]) === "number" && typeof (rightNode[key]) === "number") { //if it is number, interpolate
                let dif = NumCast(rightNode[key]) - NumCast(leftNode[key]);
                let deltaLeft = this.time - NumCast(left.time);
                let ratio = deltaLeft / (NumCast(right.time) - NumCast(left.time));
                this.props.node[key] = NumCast(leftNode[key]) + (dif * ratio);
            } else { // case data 
                let stored = leftNode[key];
                this.props.node[key] = stored instanceof ObjectField ? stored[Copy]() : stored;
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
    createRegion = async (time: number) => {
        if (await this.findRegion(time) === undefined) {  //check if there is a region where double clicking (prevents phantom regions)
            let regiondata = KeyframeFunc.defaultKeyframe(); //create keyframe data
           
            regiondata.position = time; //set position
            let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);

            if (rightRegion && rightRegion.position - regiondata.position <= 4000) { //edge case when there is less than default 4000 duration space between this and right region
                regiondata.duration = rightRegion.position - regiondata.position;
            }
            if (this.regions.length === 0 || !rightRegion || (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))) {
                this.regions.push(regiondata); 
                this._newKeyframe = true; 
                this.saveStateRegion = regiondata; 
                return regiondata;
            }
        }
    }

    @action
    makeKeyData = (regiondata: RegionData, time: number, type: KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        let doclist = DocListCast(regiondata.keyframes)!;
        let existingkf: (Doc | undefined) = undefined;
        doclist.forEach(TK => {
            if (TK.time === time) existingkf = TK;
        });
        if (existingkf) return existingkf;
        //else creates a new doc. 
        let TK: Doc = new Doc();
        TK.time = time;
        TK.key = this.makeCopy();
        TK.type = type;
        //assuming there are already keyframes (for keeping keyframes in order, sorted by time)
        if (doclist.length === 0) regiondata.keyframes!.push(TK);
        doclist.forEach(kf => {
            let index = doclist.indexOf(kf);
            let kfTime = NumCast(kf.time);
            if ((kfTime < time && index === doclist.length - 1) || (kfTime < time && time < NumCast(doclist[index + 1].time))) {
                regiondata.keyframes!.splice(index + 1, 0, TK);
                return;
            }
        });
        return TK;
    }

    @action
    makeCopy = () => {
        let doc = new Doc();
        this.primitiveWhitelist.forEach(key => {
            let originalVal = this.props.node[key];
            if (key === "data"){
                console.log(originalVal);
            }
            doc[key] = originalVal instanceof ObjectField ? originalVal[Copy]() : this.props.node[key];
        });
        return doc;
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
                            return <Keyframe {...this.props} RegionData={region} makeKeyData={this.makeKeyData} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, computed, runInAction, autorun } from "mobx";
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
    ]; 
        
    @computed private get regions() { return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;}

    componentWillMount() {
        runInAction(() => {
            if (!this.props.node.regions) this.props.node.regions = new List<Doc>();            
        });
    }

    componentDidMount() {
        runInAction(async () => {
            this._timelineVisibleReaction = this.timelineVisibleReaction(); 
            this._currentBarXReaction = this.currentBarXReaction();
            if (this.regions.length === 0) this.createRegion(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            this.props.node.hidden = false;                   
            this.props.node.opacity = 1; 
        });
    }

    componentWillUnmount() {
        runInAction(() => {
            //disposing reactions 
            if (this._currentBarXReaction) this._currentBarXReaction();
            if (this._timelineVisibleReaction) this._timelineVisibleReaction(); 
        });
    }

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

    @action 
    revertState = () => {
        let copyDoc = Doc.MakeCopy(this.props.node, true); 
        if (this._storedState) this.applyKeys(this._storedState);
        let newState = new Doc(); 
        newState.key = copyDoc; 
        this._storedState = newState; 
    }

    @action
    currentBarXReaction = () => {
        return reaction(() => this.props.currentBarX, async () => {
            let regiondata: (Doc | undefined) = await this.findRegion(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            if (regiondata) {
                this.props.node.hidden = false;
                await this.timeChange(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            } else {
                this.props.node.hidden = true;
                this.props.node.opacity = 0;
            }
        });
    }
    @action 
    timelineVisibleReaction = () => {
        return reaction(() => {
            return this.props.timelineVisible; 
        }, isVisible => {
            this.revertState(); 
        }); 
    }

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
                if(stored instanceof ObjectField){                    
                    this.props.node[key] = stored[Copy](); 
                } else {
                    this.props.node[key] = stored; 
                }
            }
        });
    }

 

    @action
    private filterKeys = (keys: string[]): string[] => {
        return keys.reduce((acc: string[], key: string) => {
            if (!this.filterList.includes(key)) acc.push(key); 
            return acc;
        }, []);
    }

    @action
    calcCurrent = async (region: Doc) => {
        let currentkf: (Doc | undefined) = undefined;
        let keyframes = await DocListCastAsync(region.keyframes!);
        keyframes!.forEach((kf) => {
            if (NumCast(kf.time) === Math.round(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement))) currentkf = kf;
        });
        return currentkf;
    }


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
                if(stored instanceof ObjectField){                    
                    this.props.node[key] = stored[Copy](); 
                } else {
                    this.props.node[key] = stored; 
                }
            }
        });
    }

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

    @action
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!;
        let offsetX = Math.round((e.clientX - inner.getBoundingClientRect().left) * this.props.transform.Scale);
        this.createRegion(KeyframeFunc.convertPixelTime(offsetX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
        this.forceUpdate(); 
    }

    createRegion = (position: number) => {
        let regiondata = KeyframeFunc.defaultKeyframe();
        regiondata.position = position;
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);

        if (rightRegion && rightRegion.position - regiondata.position <= 4000) {
            regiondata.duration = rightRegion.position - regiondata.position;
        }
        if (this.regions.length === 0 || !rightRegion || (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))) {
            this.regions.push(regiondata);
            return regiondata;
        }

    }
    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick} onPointerOver = {() => {Doc.BrushDoc(this.props.node);}}onPointerOut={() => {Doc.UnBrushDoc(this.props.node);}}>
                        {DocListCast(this.regions).map((region) => {
                            return <Keyframe {...this.props} RegionData={region} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject, runInAction, autorun } from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast, Field } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast, StrCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
import { FlyoutProps } from "./Timeline";
import { Transform } from "../../util/Transform";
import { RichTextField } from "../../../new_fields/RichTextField";
import { createObjectBindingPattern } from "typescript";
import { DateField } from "../../../new_fields/DateField";

interface IProps {
    node: Doc;
    currentBarX: number;
    transform: Transform;
    collection: Doc; 
    time: number; 
    tickIncrement: number; 
    tickSpacing: number; 
    changeCurrentBarX: (x: number) => void;
}

@observer
export class Track extends React.Component<IProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _reactionDisposers: IReactionDisposer[] = [];
    @observable private _currentBarXReaction: any;   
    @observable private _isOnKeyframe: boolean = false; 
    @observable private _onKeyframe: (Doc | undefined) = undefined; 
    @observable private _onRegionData : ( Doc | undefined) = undefined; 
    @observable private _leftCurrKeyframe: (Doc | undefined) = undefined; 

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }

    componentWillMount() {
        if (!this.props.node.regions) {
            this.props.node.regions = new List<Doc>();
        }
        this.props.node.opacity = 1;
    }

    componentDidMount() {
        runInAction(() => {
            this._currentBarXReaction = this.currentBarXReaction();
            if (this.regions.length === 0) this.createRegion(KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement));
            this.props.node.hidden = false;
        });
    }

    componentWillUnmount() {
        runInAction(() => {
            if (this._currentBarXReaction) this._currentBarXReaction();
        });
    }

    @action
    saveKeyframe = async (ref:Doc, regiondata:Doc) => { 
        let keyframes:List<Doc> = (Cast(regiondata.keyframes, listSpec(Doc)) as List<Doc>); 
        let kfIndex:number = keyframes.indexOf(ref); 
        let kf = keyframes[kfIndex] as Doc; 
        if (kf.type === KeyframeFunc.KeyframeType.default) { // only save for non-fades
            kf.key = Doc.MakeCopy(this.props.node, true);
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), kf); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), kf); //right keyframe, if it exists
            // while (leftkf !== undefined) {
            //     if (leftkf!.type === KeyframeFunc.KeyframeType.fade) {
            //         let edge:(Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), leftkf!);
            //         edge!.key = Doc.MakeCopy(kf.key as Doc, true);
            //         leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
            //         (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
            //         (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
            //     } else if (leftkf!.key ) {
            //         leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
            //     }

            // }
            
            
            
            
            if (leftkf!.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                let edge:(Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), leftkf!);
                edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
            }
            if (rightkf!.type === KeyframeFunc.KeyframeType.fade) {
                let edge:(Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!,KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement), rightkf!);
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
        }, { fireImmediately: true });
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
                this._leftCurrKeyframe = currentkf; 
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
        console.log(Doc.allKeys(docFromApply)); 
        if (this.filterKeys(Doc.allKeys(this.props.node)).length > this.filterKeys(Doc.allKeys(kfNode)).length) docFromApply = this.props.node; 
        this.filterKeys(Doc.allKeys(docFromApply)).forEach(key => {
            console.log(key);
            if (!kfNode[key]) {
                this.props.node[key] = undefined; 
            } else {
                if (key === "data") {
                    if (this.props.node.type === "text"){
                        let nodeData = (kfNode[key] as RichTextField).Data; 
                        this.props.node[key] = new RichTextField(nodeData); 
                    }
                } else if (key === "creationDate") {
                    
                    this.props.node[key] = new DateField(); 
                }  else {
                    this.props.node[key] = kfNode[key];
                }

            }
            
        });
    }


    @action
    private filterKeys = (keys: string[]): string[] => {
        return keys.reduce((acc: string[], key: string) => {
            if (key !== "regions" && key !== "cursors" && key !== "hidden" && key !== "nativeHeight" && key !== "nativeWidth" && key !== "schemaColumns") acc.push(key);
            return acc;
        }, []) as string[];
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
    interpolate = async (left: Doc, right: Doc, regiondata:Doc) => {
        let leftNode = left.key as Doc;
        let rightNode = right.key as Doc;
        const dif_time = NumCast(right.time) - NumCast(left.time);
        const timeratio = (KeyframeFunc.convertPixelTime(this.props.currentBarX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement) - NumCast(left.time)) / dif_time; //linear 
        let keyframes = (await DocListCastAsync(regiondata.keyframes!))!; 
        let indexLeft = keyframes.indexOf(left); 
        let interY:List<number> = (await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).interpolationY as List<number>)!;  
        let realIndex = (interY.length - 1) * timeratio; 
        let xIndex = Math.floor(realIndex);  
        let yValue = interY[xIndex]; 
        let secondYOffset:number = yValue; 
        let minY = interY[0];  // for now
        let maxY = interY[interY.length - 1]; //for now 
        if (interY.length !== 1) {
            secondYOffset = interY[xIndex] + ((realIndex - xIndex) / 1) * (interY[xIndex + 1] - interY[xIndex]) - minY; 
        }        
        let finalRatio = secondYOffset / (maxY - minY); 
        let pathX:List<number> = await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).pathX as List<number>; 
        let pathY:List<number> = await ((regiondata.functions as List<Doc>)[indexLeft] as Doc).pathY as List<number>;  
        let proposedX = 0; 
        let proposedY = 0; 
        if (pathX.length !== 0) {
            let realPathCorrespondingIndex = finalRatio  * (pathX.length - 1); 
            let pathCorrespondingIndex = Math.floor(realPathCorrespondingIndex); 
            if (pathCorrespondingIndex >= pathX.length - 1) {
                proposedX = pathX[pathX.length - 1]; 
                proposedY = pathY[pathY.length - 1]; 
            } else if (pathCorrespondingIndex < 0){
                proposedX = pathX[0]; 
                proposedY = pathY[0]; 
            } else {
                proposedX = pathX[pathCorrespondingIndex] + ((realPathCorrespondingIndex - pathCorrespondingIndex) / 1) * (pathX[pathCorrespondingIndex + 1] - pathX[pathCorrespondingIndex]); 
                proposedY = pathY[pathCorrespondingIndex] + ((realPathCorrespondingIndex - pathCorrespondingIndex) / 1) * (pathY[pathCorrespondingIndex + 1] - pathY[pathCorrespondingIndex]);
            }
           
        }
        this.filterKeys(Doc.allKeys(leftNode)).forEach(key => {
            if (leftNode[key] && rightNode[key] && typeof (leftNode[key]) === "number" && typeof (rightNode[key]) === "number") { //if it is number, interpolate
                if ((key === "x" || key === "y") && pathX.length !== 0){
                    if (key === "x") this.props.node[key] = proposedX; 
                    if (key === "y") this.props.node[key] = proposedY; 
                } else {
                    const diff = NumCast(rightNode[key]) - NumCast(leftNode[key]);
                    const adjusted = diff * finalRatio;
                    this.props.node[key] = NumCast(leftNode[key]) + adjusted;
                }
            } else {
                if (key === "data") {
                    if (this.props.node.type === "text"){
                        let nodeData = StrCast((leftNode[key] as RichTextField).Data); 
                        let currentNodeData = StrCast((this.props.node[key] as RichTextField).Data); 
                        if (nodeData !== currentNodeData) {
                            this.props.node[key] = new RichTextField(nodeData); 
                        }
                    }    
                } else if (key === "creationDate") {

                } else {
                    this.props.node[key] = leftNode[key];
                }
            }
        });
    }

    @action
    findRegion = async (time: number)  => {
        let foundRegion:(Doc | undefined) = undefined;
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
    }

    createRegion = (position: number) => {
        let regiondata = KeyframeFunc.defaultKeyframe();
        regiondata.position = position;
        let leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, regiondata, this.regions);
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions);
        if ((rightRegion && leftRegion && rightRegion.position - (leftRegion.position + leftRegion.duration) < NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut)) || (rightRegion && rightRegion.position - regiondata.position < NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))) {
            return;
        } else if (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut)) {
            regiondata.duration = rightRegion.position - regiondata.position;
        }
        this.regions.push(regiondata);
        return regiondata;
    }


    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {DocListCast(this.regions).map((region) => {
                            return <Keyframe {...this.props} RegionData={region}/>;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
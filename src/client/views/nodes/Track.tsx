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
import { AddComparisonParameters } from "../../northstar/model/idea/idea";
import { CollectionSchemaBooleanCell } from "../collections/CollectionSchemaCells";

interface IProps {
    node: Doc;
    currentBarX: number;
    transform: Transform;
    collection: Doc; 
    changeCurrentBarX: (x: number) => void;
    setFlyout: (props: FlyoutProps) => any;
}

@observer
export class Track extends React.Component<IProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();
    @observable private _reactionDisposers: IReactionDisposer[] = [];
    @observable private _keyReaction: any; //reaction that is used to dispose when necessary 
    @observable private _currentBarXReaction: any;

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
            if (this.regions.length === 0) this.createRegion(this.props.currentBarX);
            this.props.node.hidden = false;
        });
    }

    componentWillUnmount() {
        runInAction(() => {
            if (this._keyReaction) this._keyReaction();
            if (this._currentBarXReaction) this._currentBarXReaction();
        });
    }

    @action
    keyReaction = () => { 
        return reaction( () => {
            return Doc.allKeys(this.props.node).map(key => FieldValue(this.props.node[key]));
        }, async () => {
            let regiondata: (Doc | undefined) = await this.findRegion(this.props.currentBarX) ;
            if (regiondata) {
                let keyframes = await DocListCastAsync((regiondata as Doc).keyframes!); 
                keyframes!.forEach( async (kf) => {
                    if (kf.type === KeyframeFunc.KeyframeType.default && kf.time === this.props.currentBarX) {
                        console.log("full keychange triggered"); 
                        //for this specific keyframe
                        kf.key = Doc.MakeCopy(this.props.node, true);

                        //for fades
                        let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, this.props.currentBarX, kf); // lef keyframe, if it exists
                        let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!, this.props.currentBarX, kf); //right keyframe, if it exists
                        if (leftkf!.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                            let edge:(Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata!, this.props.currentBarX, leftkf!);
                            edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                            leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                            (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                            (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
                        }
                        if (rightkf!.type === KeyframeFunc.KeyframeType.fade) {
                            let edge:(Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata!,this.props.currentBarX, rightkf!);
                            edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                            rightkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                            (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                            (Cast(rightkf!.key, Doc)! as Doc).opacity = 1;
                        }
                    }
                });
            }
        }, {fireImmediately: true});
    }

    @action 
    currentBarXReaction = () => {
        return reaction(() => this.props.currentBarX, async () => {
            if (this._keyReaction) this._keyReaction(); //dispose previous reaction first
            let regiondata: (Doc | undefined) = await this.findRegion(this.props.currentBarX);
            if (regiondata) {
                this.props.node.hidden = false;
                await this.timeChange(this.props.currentBarX);
            } else {
                this.props.node.hidden = true;
            }
        }, { fireImmediately: true });
    }


    @action
    timeChange = async (time: number) => {
        let regiondata = await this.findRegion(Math.round(time)); //finds a region that the scrubber is on
        if (regiondata) {
            let leftkf: (Doc | undefined) = await KeyframeFunc.calcMinLeft(regiondata, this.props.currentBarX); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = await KeyframeFunc.calcMinRight(regiondata, this.props.currentBarX); //right keyframe, if it exists            
            let currentkf: (Doc | undefined) = await this.calcCurrent(regiondata); //if the scrubber is on top of the keyframe
            if (currentkf) {
                await this.applyKeys(currentkf);
                this._keyReaction = this.keyReaction(); //reactivates reaction. 
            } else if (leftkf && rightkf) {
                this.interpolate(leftkf, rightkf, regiondata);
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
                this.props.node[key] = kfNode[key];
            }
        });
    }


    @action
    private filterKeys = (keys: string[]): string[] => {
        return keys.reduce((acc: string[], key: string) => {
            if (key !== "regions" && key !== "data" && key !== "creationDate" && key !== "cursors" && key !== "hidden" && key !== "nativeHeight" && key !== "nativeWidth") acc.push(key);
            return acc;
        }, []) as string[];
    }

    @action
    calcCurrent = async (region: Doc) => {
        let currentkf: (Doc | undefined) = undefined;
        let keyframes = await DocListCastAsync(region.keyframes!); 
        keyframes!.forEach((kf) => {
            if (NumCast(kf.time) === Math.round(this.props.currentBarX)) currentkf = kf;
        });
        return currentkf;
    }

    @action
    interpolate = (left: Doc, right: Doc, regiondata:Doc) => {
        console.log("interpolating");
        let leftNode = left.key as Doc;
        let rightNode = right.key as Doc;
        const dif_time = NumCast(right.time) - NumCast(left.time);
        const timeratio = (this.props.currentBarX - NumCast(left.time)) / dif_time; //linear 
        let indexLeft = DocListCast(regiondata.keyframes!).indexOf(left); 
        let interpolationY:List<number> = ((regiondata.functions as List<Doc>)[indexLeft] as Doc).interpolationY as List<number>;  
        let realIndex = (interpolationY.length - 1) * timeratio; 
        let xIndex = Math.floor(realIndex);  
        let yValue = interpolationY[xIndex]; 
        let secondYOffset:number = yValue; 
        let minY = interpolationY[0];  // for now
        let maxY = interpolationY[interpolationY.length - 1]; //for now 
        if (interpolationY.length !== 1) {
            secondYOffset = interpolationY[xIndex] + ((realIndex - xIndex) / 1) * (interpolationY[xIndex + 1] - interpolationY[xIndex]) - minY; 
        }
        console.log(secondYOffset); 
        console.log(maxY - minY); 
        console.log(minY); 
        let finalRatio = secondYOffset / (maxY - minY); 
        console.log(finalRatio); 
        this.filterKeys(Doc.allKeys(leftNode)).forEach(key => {
            if (leftNode[key] && rightNode[key] && typeof (leftNode[key]) === "number" && typeof (rightNode[key]) === "number") { //if it is number, interpolate
                const diff = NumCast(rightNode[key]) - NumCast(leftNode[key]);
                const adjusted = diff * finalRatio;
                this.props.node[key] = NumCast(leftNode[key]) + adjusted;
            } else {
                this.props.node[key] = leftNode[key];
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
        this.createRegion(offsetX);
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
                            return <Keyframe node={this.props.node} RegionData={region} changeCurrentBarX={this.props.changeCurrentBarX} setFlyout={this.props.setFlyout} transform={this.props.transform} collection={this.props.collection}/>;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
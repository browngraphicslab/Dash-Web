import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject, runInAction } from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast, Field } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast, StrCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
import { FlyoutProps } from "./Timeline";
import { Transform } from "../../util/Transform";
import { AddComparisonParameters } from "../../northstar/model/idea/idea";

interface IProps {
    node: Doc;
    currentBarX: number;
    transform: Transform;
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
            if (this.regions.length === 0 ) this.createRegion(this.props.currentBarX);
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
        return reaction(() => {
            console.log("triggered keyReaction"); 
            let keys = Doc.allKeys(this.props.node);
            return keys.map(key => FieldValue(this.props.node[key]));
        }, data => {
            console.log("full reaction");
            let regiondata = this.findRegion(this.props.currentBarX);
            if (regiondata) {
                DocListCast(regiondata.keyframes!).forEach((kf) => {
                    if (kf.type === KeyframeFunc.KeyframeType.default && kf.time === this.props.currentBarX) {
                        console.log("data updated"); 
                        kf.key = Doc.MakeCopy(this.props.node, true);
                        let leftkf: (Doc | undefined) = this.calcMinLeft(regiondata!, kf); // lef keyframe, if it exists
                        let rightkf: (Doc | undefined) = this.calcMinRight(regiondata!, kf); //right keyframe, if it exists
                        if (leftkf!.type === KeyframeFunc.KeyframeType.fade) { //replicating this keyframe to fades
                            let edge = this.calcMinLeft(regiondata!, leftkf!);
                            edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                            leftkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                            (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                            (Cast(leftkf!.key, Doc)! as Doc).opacity = 1;
                        }
                        if (rightkf!.type === KeyframeFunc.KeyframeType.fade) {
                            let edge = this.calcMinRight(regiondata!, rightkf!);
                            edge!.key = Doc.MakeCopy(kf.key as Doc, true);
                            rightkf!.key = Doc.MakeCopy(kf.key as Doc, true);
                            (Cast(edge!.key, Doc)! as Doc).opacity = 0.1;
                            (Cast(rightkf!.key, Doc)! as Doc).opacity = 1;
                        }
                    }
                });
            }
        });
    }

    @action
    currentBarXReaction = () => {
        return reaction(() =>  this.props.currentBarX, () => {
            if (this._keyReaction) this._keyReaction(); //dispose previous reaction first
            let regiondata: (Doc | undefined) = this.findRegion(this.props.currentBarX);
            if (regiondata) {
                this.props.node.hidden = false;                
                this.timeChange(this.props.currentBarX);
                DocListCast(regiondata.keyframes).forEach((kf) => {
                    if (kf.time === this.props.currentBarX && kf.type === KeyframeFunc.KeyframeType.default) {
                        this.applyKeys(kf); 
                        this._keyReaction = this.keyReaction(); //reactivates reaction. 
                    }
                });                
            } else {
                this.props.node.hidden = true;
            }
        }, { fireImmediately: true });
    }


    @action
    timeChange = (time: number) => {
        let regiondata = this.findRegion(Math.round(time)); //finds a region that the scrubber is on
        if (regiondata) {
            let leftkf: (Doc | undefined) = this.calcMinLeft(regiondata!); // lef keyframe, if it exists
            let rightkf: (Doc | undefined) = this.calcMinRight(regiondata!); //right keyframe, if it exists            
            let currentkf: (Doc | undefined) = this.calcCurrent(regiondata!); //if the scrubber is on top of the keyframe
           
            if (leftkf && rightkf) {
                this.interpolate(leftkf, rightkf);
            }  
        }
    }

    @action
    private applyKeys = (kf: Doc) => {
        this.filterKeys(Doc.allKeys(kf)).forEach(key => {
            if (key === "title" || key === "documentText") Doc.SetOnPrototype(this.props.node, key, StrCast(kf[key]));
            this.props.node[key] = kf[key];
        });
    }


    @action
    private filterKeys = (keys: string[]): string[] => {
        return keys.reduce((acc: string[], key: string) => {
            if (key !== "regions" && key !== "data" && key !== "creationDate" && key !== "cursors" && key !== "hidden" && key !== "nativeHeight" && key!== "nativeWidth") acc.push(key);
            return acc;
        }, []) as string[];
    }

    @action
    calcCurrent = (region: Doc): (Doc | undefined) => {
        let currentkf: (Doc | undefined) = undefined;
        DocListCast(region.keyframes!).forEach((kf) => {
            if (NumCast(kf.time) === Math.round(this.props.currentBarX)) currentkf = kf;
        });
        return currentkf;
    }


    @action
    calcMinLeft = (region: Doc, ref?: Doc): (Doc | undefined) => { //returns the time of the closet keyframe to the left
        let leftKf: (Doc | undefined) = undefined;
        let time: number = 0;
        DocListCast(region.keyframes!).forEach((kf) => {
            let compTime = this.props.currentBarX;
            if (ref) {
                compTime = NumCast(ref.time);
            }
            if (NumCast(kf.time) < compTime && NumCast(kf.time) >= time) {
                leftKf = kf;
                time = NumCast(kf.time);
            }
        });
        return leftKf;
    }


    @action
    calcMinRight = (region: Doc, ref?: Doc): (Doc | undefined) => { //returns the time of the closest keyframe to the right 
        let rightKf: (Doc | undefined) = undefined;
        let time: number = Infinity;
        DocListCast(region.keyframes!).forEach((kf) => {
            let compTime = this.props.currentBarX;
            if (ref) {
                compTime = NumCast(ref.time);
            }
            if (NumCast(kf.time) > compTime && NumCast(kf.time) <= NumCast(time)) {
                rightKf = kf;
                time = NumCast(kf.time);
            }
        });
        return rightKf;
    }

    @action
    interpolate = (left: Doc, right: Doc) => {
        console.log("interpolating");
        let leftNode = left.key as Doc;
        let rightNode = right.key as Doc;
        const dif_time = NumCast(right.time) - NumCast(left.time);
        const ratio = (this.props.currentBarX - NumCast(left.time)) / dif_time; //linear 
        this.filterKeys(Doc.allKeys(leftNode)).forEach(key => {
            if (leftNode[key] && rightNode[key] && typeof (leftNode[key]) === "number" && typeof (rightNode[key]) === "number") { //if it is number, interpolate
                const diff = NumCast(rightNode[key]) - NumCast(leftNode[key]);
                const adjusted = diff * ratio;
                this.props.node[key] = NumCast(leftNode[key]) + adjusted;                
            } else if (key === "title" || key === "documentText") {
                Doc.SetOnPrototype(this.props.node, key, StrCast(leftNode[key]));
                this.props.node[key] = leftNode[key];
            }
        });
    }

    @action
    findRegion(time: number): (RegionData | undefined) {
        let foundRegion = undefined;
        DocListCast(this.regions).map(region => {
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
                            return <Keyframe node={this.props.node} RegionData={region} changeCurrentBarX={this.props.changeCurrentBarX} setFlyout={this.props.setFlyout} transform={this.props.transform} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
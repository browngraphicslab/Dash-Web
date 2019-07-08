import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject } from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, KeyframeFunc } from "./Keyframe";
import { FlyoutProps } from "./Timeline";

interface IProps {
    node: Doc;
    currentBarX: number;
    changeCurrentBarX: (x:number) => void;
    setFlyout: (props:FlyoutProps) => any; 
}


@observer
export class Track extends React.Component<IProps> {
    @observable private _inner = React.createRef<HTMLDivElement>();   
    @observable private _keys = ["x", "y", "width", "height", "panX", "panY", "scale"];

    private _reactionDisposers: IReactionDisposer[] = [];
    private _selectionManagerChanged?: IReactionDisposer;

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }

    componentWillMount() {
        this.props.node.regions = new List<Doc>();
    }

    @action
    componentDidMount() {
        this.props.node.hidden = true;
        this.props.node.opacity = 0;
        reaction(() => this.props.currentBarX, () => {
            let region: (Doc | undefined) = this.findRegion(this.props.currentBarX);
            if (region !== undefined) {
                this.props.node.hidden = false;
                this.timeChange(this.props.currentBarX);
            } else {
                this.props.node.hidden = true;
            }
        });

        reaction(() => {
            let keys = Doc.allKeys(this.props.node); 
            return keys.map(key => FieldValue(this.props.node[key]));
        }, data => {
            let regiondata = this.findRegion(this.props.currentBarX); 
            if (regiondata){
                (Cast(regiondata.keyframes!, listSpec(Doc)) as List<Doc>).forEach((kf) => {
                    kf = kf as Doc; 
                    if(NumCast(kf.time!) === this.props.currentBarX){
                        console.log("hoorayy!!!"); 
                    }
                }); 
            }
           
        }); 
    }
    /**
     * removes reaction when the component is removed from the timeline
     */
    componentWillUnmount() {
        this._reactionDisposers.forEach(disp => disp());
        this._reactionDisposers = [];
    }


    @action
    timeChange = async (time: number) => {
        let region = this.findRegion(time);
        let leftkf: (Doc | undefined) = this.calcMinLeft(region!);
        let rightkf: (Doc | undefined) = this.calcMinRight(region!);
        if (leftkf && rightkf) {
            this.interpolate(leftkf, rightkf);
        } else if (leftkf) {
            console.log("left exists"); 
            console.log(leftkf.time); 
            this._keys.forEach(k => {
                let data = leftkf!.key as Doc;
                this.props.node[k] = data[k];
            });
        } else if (rightkf) {
            this._keys.forEach(k => {
                let data = rightkf!.key as Doc;
                this.props.node[k] = data[k];
            });
        }
    }


    @action
    calcMinLeft = (region: Doc): (Doc | undefined) => { //returns the time of the closet keyframe to the left
        let leftKf:(Doc| undefined) = undefined;
        let time:number = 0; 
        (region.keyframes! as List<Doc>).forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) < this.props.currentBarX && NumCast(kf.time) >= NumCast(time)) {
                leftKf = kf;
                time = NumCast(kf.time); 
            }
        });
        return leftKf;
    }


    @action
    calcMinRight = (region: Doc): (Doc | undefined) => { //returns the time of the closest keyframe to the right 
        let rightKf: (Doc|undefined) = undefined;
        let time:number = Infinity; 
        (region.keyframes! as List<Doc>).forEach((kf) => {
            kf = kf as Doc;
            if (NumCast(kf.time) > this.props.currentBarX && NumCast(kf.time) <= NumCast(time)) {
                rightKf = kf;
                time = NumCast(kf.time); 
            }
        });
        return rightKf;
    }

    @action
    interpolate = async (kf1: Doc, kf2: Doc) => {
        let node1 = kf1.key as Doc;
        let node2 = kf2.key as Doc;
        console.log(toJS(node1));
        console.log(toJS(node2));
        const dif_time = NumCast(kf2.time) - NumCast(kf1.time);
        const ratio = (this.props.currentBarX - NumCast(kf1.time)) / dif_time; //linear 

        this._keys.forEach(key => {
            const diff = NumCast(node2[key]) - NumCast(node1[key]);
            const adjusted = diff * ratio;
            this.props.node[key] = NumCast(node1[key]) + adjusted;
        });
    }

    @action
    findRegion(time: number): (Doc | undefined) {
        let foundRegion = undefined;
        this.regions.map(region => {
            region = region as Doc; 
            if (time >= NumCast(region.position) && time <= (NumCast(region.position) + NumCast(region.duration))) {
                foundRegion = region;
            }
        });
        return foundRegion;
    }

    @action
    onInnerDoubleClick = (e: React.MouseEvent) => {
        let inner = this._inner.current!;
        let left = inner.getBoundingClientRect().left;
        let offsetX = Math.round(e.clientX - left);
        let regiondata: Doc = new Doc(); //creating regiondata
        regiondata.duration = 200;
        regiondata.position = offsetX;
        regiondata.fadeIn = 20; 
        regiondata.fadeOut = 20; 
        regiondata.keyframes = new List<Doc>();
        let leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, regiondata, this.regions); 
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions); 
        if ((rightRegion && leftRegion && rightRegion.position - (leftRegion.position + leftRegion.duration) < regiondata.fadeIn + regiondata.fadeOut) || (rightRegion && rightRegion.position - regiondata.position < regiondata.fadeIn + regiondata.fadeOut)){
            return; 
        } else if (rightRegion && rightRegion.position - regiondata.position >= regiondata.fadeIn + regiondata.fadeOut){
            regiondata.duration = rightRegion.position - regiondata.position; 
        }
        this.regions.push(regiondata);
    }


   

    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {this.regions.map((region) => {
                            return <Keyframe node={this.props.node} RegionData={region as Doc} changeCurrentBarX={this.props.changeCurrentBarX} setFlyout={this.props.setFlyout}/>;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
import * as React from "react";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, IObservableObject, runInAction } from "mobx";
import "./Track.scss";
import { Doc, DocListCastAsync, DocListCast } from "../../../new_fields/Doc";
import { Document, listSpec, createSchema, makeInterface, defaultSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Keyframe, KeyframeFunc, RegionData } from "./Keyframe";
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
    @observable private _reactionDisposers: IReactionDisposer[] = [];
    @observable private _keyReaction:any; //reaction that is used to dispose when necessary 
    @observable private _currentBarXReaction:any; 

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }

    componentWillMount() {
        if (!this.props.node.regions){
            this.props.node.regions = new List<Doc>();
        }
        this.props.node.opacity = 1;         
        this.props.node.hidden = true;
    }

    componentDidMount() {
        runInAction(() => {
            this._keyReaction = this.keyReaction(); 
            this._currentBarXReaction = this.currentBarXReaction(); 
        }); 
    }

    componentWillUnmount() {
       runInAction(() => {
           this._keyReaction(); 
           this._currentBarXReaction(); 
       }); 
    }

    @action 
    keyReaction = () => {
        return reaction(() => {
            console.log("keyreaction ran");
            let keys = Doc.allKeys(this.props.node); 
            return keys.map(key => FieldValue(this.props.node[key]));     
        }, data => {
            console.log("full reaction")
            let regiondata = this.findRegion(this.props.currentBarX);
            if (regiondata){
                DocListCast(regiondata.keyframes!).forEach((kf) => {
                    if(NumCast(kf.time!) === this.props.currentBarX){
                        kf.key = Doc.MakeCopy(this.props.node, true); 
                    } 
                }); 
            }
        }); 
    }

    @action 
    currentBarXReaction = () => {
        return reaction(() => this.props.currentBarX, () => {
            console.log("current ran"); 
            (this._keyReaction as IReactionDisposer)(); // disposing reaction 
            let regiondata: (Doc | undefined) = this.findRegion(this.props.currentBarX);
            if (regiondata) {              
                this.timeChange(this.props.currentBarX);    
                this.props.node.hidden = false;                        
            } else {
                this.props.node.hidden = true;
            }
            this._keyReaction = this.keyReaction(); 

        });
    }


    @action
    timeChange = async (time: number) => {
        let region = this.findRegion(Math.round(time)); //finds a region that the scrubber is on
        let leftkf: (Doc | undefined) = this.calcMinLeft(region!); // lef keyframe, if it exists
        let rightkf: (Doc | undefined) = this.calcMinRight(region!); //right keyframe, if it exists
        let currentkf: (Doc | undefined) = this.calcCurrent(region!); //if the scrubber is on top of the keyframe
        if (currentkf){
            this.applyKeys(currentkf.key as Doc); 
        } else if (leftkf && rightkf) {
            this.interpolate(leftkf, rightkf);
        } else if (leftkf) {                
            this.applyKeys(leftkf); 
        } else if (rightkf) {
            this.applyKeys(rightkf); 
        }
    }

    @action 
    private applyKeys = (kf: Doc) => {
        let kf_length = Doc.allKeys(kf).length; 
        let node_length = Doc.allKeys(this.props.node).length; 
        if (kf_length > node_length) {
            this.filterKeys(Doc.allKeys(kf)).forEach((k) => {
                this.props.node[k] = kf[k]; 
            }); 
        } else {
            this.filterKeys(Doc.allKeys(this.props.node)).forEach((k) => {
                if (kf[k] === undefined) {
                    this.props.node[k] = undefined; 
                } else {
                    this.props.node[k] = kf[k]; 
                }
            }); 
        }
    }

    @action 
    private filterKeys = (keys:string[]):string[] => {
        return keys.reduce((acc:string[], key:string) => {
            if ( key !== "regions" && key !== "data" && key !== "creationDate" && key !== "cursors" && key !== "hidden"){
                acc.push(key); 
            }
            return acc; 
        }, []) as string[];
    }

    @action 
    calcCurrent = (region:Doc):(Doc|undefined) => {
        let currentkf:(Doc|undefined) = undefined; 
        DocListCast(region.keyframes!).forEach((kf) => {
            if (NumCast(kf.time) === Math.round(this.props.currentBarX)){
                currentkf = kf; 
            }
        }); 
        return currentkf; 
    }


    @action
    calcMinLeft = (region: Doc): (Doc | undefined) => { //returns the time of the closet keyframe to the left
        let leftKf:(Doc| undefined) = undefined;
        let time:number = 0; 
        DocListCast(region.keyframes!).forEach((kf) => {
            if (NumCast(kf.time) < this.props.currentBarX && NumCast(kf.time) > NumCast(time)) {
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
        DocListCast(region.keyframes!).forEach((kf) => {
            if (NumCast(kf.time) > this.props.currentBarX && NumCast(kf.time) < NumCast(time)) {
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
        let mainNode = new Doc(); 
        const dif_time = NumCast(kf2.time) - NumCast(kf1.time);
        const ratio = (this.props.currentBarX - NumCast(kf1.time)) / dif_time; //linear 

        let keys = []; 
        if (this.filterKeys(Doc.allKeys(node1)).length === Math.max(this.filterKeys(Doc.allKeys(node1)).length, this.filterKeys(Doc.allKeys(node2)).length )){
            keys = this.filterKeys(Doc.allKeys(node1)); 
            mainNode = node1; 
        } else {
            keys = this.filterKeys(Doc.allKeys(node2)); 
            mainNode = node2; 
        }
    
         
        keys.forEach(key => {
            if (node1[key] && node2[key] && typeof(node1[key]) === "number" && typeof(node2[key]) === "number"){
                const diff = NumCast(node2[key]) - NumCast(node1[key]);
                const adjusted = diff * ratio;
                this.props.node[key] = NumCast(node1[key]) + adjusted;
            } else if (key === "title") {
                Doc.SetOnPrototype(this.props.node, "title", mainNode[key] as string);
            } else if (key === "documentText"){
                Doc.SetOnPrototype(this.props.node, "documentText", mainNode[key] as string); 
            }
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
        let regiondata = KeyframeFunc.defaultKeyframe();
        regiondata.position = offsetX; 
        let leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, regiondata, this.regions); 
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, regiondata, this.regions); 
        if ((rightRegion && leftRegion && rightRegion.position - (leftRegion.position + leftRegion.duration) < NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut)) || (rightRegion && rightRegion.position - regiondata.position < NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut))){
            return; 
        } else if (rightRegion && rightRegion.position - regiondata.position >= NumCast(regiondata.fadeIn) + NumCast(regiondata.fadeOut)){
            regiondata.duration = rightRegion.position - regiondata.position; 
        }
        this.regions.push(regiondata);
    }


    render() {
        return (
            <div className="track-container">
                <div className="track">
                    <div className="inner" ref={this._inner} onDoubleClick={this.onInnerDoubleClick}>
                        {DocListCast(this.regions).map((region) => {
                            return <Keyframe node={this.props.node} RegionData={region} changeCurrentBarX={this.props.changeCurrentBarX} setFlyout={this.props.setFlyout}/>;
                        })}
                    </div>
                </div>
            </div>
        );
    }
}
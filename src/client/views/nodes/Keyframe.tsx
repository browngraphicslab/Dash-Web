import * as React from "react";
import "./Keyframe.scss";
import "./Timeline.scss";
import "./../globalCssVariables.scss";
import { observer, Observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, isComputedProp } from "mobx";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Cast, FieldValue, StrCast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { createSchema, defaultSpec, makeInterface, listSpec } from "../../../new_fields/Schema";
import { any } from "bluebird";
import { FlyoutProps } from "./Timeline";
import { number } from "prop-types";
import { CollectionSchemaView, CollectionSchemaPreview } from "../collections/CollectionSchemaView";
import { faDiceOne } from "@fortawesome/free-solid-svg-icons";

export namespace KeyframeFunc{
    export enum KeyframeType{
        fade = "fade", 
        default = "default",
    }
    export enum Direction{
        left = "left", 
        right = "right"
    } 
    export const findAdjacentRegion = (dir: KeyframeFunc.Direction, currentRegion:Doc, regions:List<Doc>): (RegionData | undefined) => {
        let leftMost: (RegionData | undefined) = undefined;
        let rightMost: (RegionData | undefined) = undefined;
        regions.forEach(region => {
            let neighbor = RegionData(region as Doc);
            if (currentRegion.position! > neighbor.position) {
                if (!leftMost || neighbor.position > leftMost.position) {
                    leftMost = neighbor;
                }
            } else if (currentRegion.position! < neighbor.position) {
                if (!rightMost || neighbor.position < rightMost.position) {
                    rightMost = neighbor;
                }
            }
        });
        if (dir === Direction.left) {
            return leftMost;
        } else if (dir === Direction.right) {
            return rightMost;
        }
    }; 

    export const defaultKeyframe = () => {
        let regiondata =  new Doc(); //creating regiondata
        regiondata.duration = 200;
        regiondata.position = 0;
        regiondata.fadeIn = 20; 
        regiondata.fadeOut = 20; 
        return regiondata; 
    }; 
}


export const RegionDataSchema = createSchema({
    position: defaultSpec("number", 0),
    duration: defaultSpec("number", 0),
    keyframes: listSpec(Doc), 
    fadeIn: defaultSpec("number", 0), 
    fadeOut: defaultSpec("number", 0)
});
export type RegionData = makeInterface<[typeof RegionDataSchema]>;
export const RegionData = makeInterface(RegionDataSchema);

interface IProps {
    node: Doc;
    RegionData: Doc;
    changeCurrentBarX: (x: number) => void; 
    setFlyout:(props:FlyoutProps) => any; 
}

@observer
export class Keyframe extends React.Component<IProps> {

    @observable private _bar = React.createRef<HTMLDivElement>();    
    @computed
    private get regiondata() {
        let index = this.regions.indexOf(this.props.RegionData);
        return RegionData(this.regions[index] as Doc);
    }

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }    


    componentWillMount(){

        
        if (!this.regiondata.keyframes){
            this.regiondata.keyframes = new List<Doc>(); 
           
        }
    }


    @action
    componentDidMount() {
                    
            let fadeIn = this.makeKeyData(this.regiondata.position + this.regiondata.fadeIn, KeyframeFunc.KeyframeType.fade)!; 
            let fadeOut = this.makeKeyData(this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut, KeyframeFunc.KeyframeType.fade)!;   
            let start = this.makeKeyData(this.regiondata.position, KeyframeFunc.KeyframeType.fade)!;
            let finish = this.makeKeyData(this.regiondata.position + this.regiondata.duration, KeyframeFunc.KeyframeType.fade)!; 
            (fadeIn.key! as Doc).opacity = 1; 
            (fadeOut.key! as Doc).opacity = 1;  
            (start.key! as Doc) .opacity = 0.1; 
            (finish.key! as Doc).opacity = 0.1; 
            
        observe(this.regiondata, change => {
            if (change.type === "update"){
                fadeIn.time = this.regiondata.position + this.regiondata.fadeIn; 
                fadeOut.time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut; 
                start.time = this.regiondata.position; 
                finish.time = this.regiondata.position + this.regiondata.duration;

                let fadeInIndex = this.regiondata.keyframes!.indexOf(fadeIn); 
                let fadeOutIndex = this.regiondata.keyframes!.indexOf(fadeOut); 
                let startIndex = this.regiondata.keyframes!.indexOf(start); 
                let finishIndex = this.regiondata.keyframes!.indexOf(finish); 
        
                this.regiondata.keyframes![fadeInIndex] = fadeIn; 
                this.regiondata.keyframes![fadeOutIndex] =  fadeOut;  
                this.regiondata.keyframes![startIndex] = start; 
                this.regiondata.keyframes![finishIndex] = finish;
                this.forceUpdate(); 
            }
        }); 
    }

    @action
    makeKeyData = (kfpos: number, type:KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        let hasData = false;
        this.regiondata.keyframes!.forEach(TK => { //TK is TimeAndKey
            TK = TK as Doc;
            if (TK.time === kfpos) {
                hasData = true;
            }
        });
        if (!hasData) {
            let TK: Doc = new Doc();
            TK.time = kfpos; 
            TK.key = Doc.MakeCopy(this.props.node, true); 
            TK.type = type;            
            this.regiondata.keyframes!.push(TK);
            return TK; 
        }
    }

    @action
    onBarPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onBarPointerMove);
        document.addEventListener("pointerup", (e: PointerEvent) => {
            document.removeEventListener("pointermove", this.onBarPointerMove);
        });
    }
   

    @action
    onBarPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let left = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions)!;
        let right = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions!);      
        // let bar = this._bar.current!; 
        // let barX = bar.getBoundingClientRect().left;
        // let offset = e.clientX - barX;
        let prevX = this.regiondata.position; 
        let futureX = this.regiondata.position + e.movementX;
        if (futureX <= 0) {
            this.regiondata.position = 0;
        } else if ((left && left.position + left.duration >= futureX)) {
            this.regiondata.position = left.position + left.duration;
        } else if ((right && right.position <= futureX + this.regiondata.duration)) {
            this.regiondata.position = right.position - this.regiondata.duration;
        } else {
            this.regiondata.position = futureX;
        }
        for (let i = 0; i < this.regiondata.keyframes!.length; i++) {
            if ((this.regiondata.keyframes![i] as Doc).type !== KeyframeFunc.KeyframeType.fade){
                let movement = this.regiondata.position - prevX;
                (this.regiondata.keyframes![i] as Doc).time = NumCast((this.regiondata.keyframes![i] as Doc).time) + movement;
            }
        }
        this.forceUpdate(); 
    }

    @action
    onResizeLeft = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onDragResizeLeft);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onDragResizeLeft);
        });
    }

    @action
    onResizeRight = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        document.addEventListener("pointermove", this.onDragResizeRight);
        document.addEventListener("pointerup", () => {
            document.removeEventListener("pointermove", this.onDragResizeRight);
        });
    }

    @action
    onDragResizeLeft = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let barX = bar.getBoundingClientRect().left;
        let offset = e.clientX - barX;
        if (this.regiondata.duration - offset < this.regiondata.fadeIn + this.regiondata.fadeOut){
            this.regiondata.position -= (this.regiondata.fadeIn + this.regiondata.fadeOut - this.regiondata.duration); 
            this.regiondata.duration = this.regiondata.fadeIn + this.regiondata.fadeOut; 
        } else {
            this.regiondata.duration -= offset;                
            this.regiondata.position += offset;
        }
        // for (let i = 0; i < this.regiondata.keyframes!.length; i++){
        //     console.log((this.regiondata.keyframes![i] as Doc).time); 
        //     (this.regiondata.keyframes![i] as Doc).time = NumCast((this.regiondata.keyframes![i] as Doc).time) - offset; 
        //     console.log((this.regiondata.keyframes![i] as Doc).time); 
        // }
    }


    @action
    onDragResizeRight = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let barX = bar.getBoundingClientRect().right;
        let offset = e.clientX - barX;
        if (this.regiondata.duration + offset < this.regiondata.fadeIn + this.regiondata.fadeOut){
            this.regiondata.duration = this.regiondata.fadeIn + this.regiondata.fadeOut;
        }else {        
            this.regiondata.duration += offset;
        }
    }

    createDivider = (type?: KeyframeFunc.Direction): JSX.Element => {
        if (type === "left") {
            return <div className="divider" style={{ right: "0px" }}></div>;
        } else if (type === "right") {
            return <div className="divider" style={{ left: "0px" }}> </div>;
        }
        return <div className="divider"></div>;
    }

    @action
    createKeyframe = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!; 
        let offset = e.clientX - bar.getBoundingClientRect().left; 
        let position = NumCast(this.regiondata.position);            
        this.makeKeyData(Math.round(position + offset));           
        this.props.changeCurrentBarX(NumCast(Math.round(position + offset))); //first move the keyframe to the correct location and make a copy so the correct file gets coppied
    }

    @action 
    moveKeyframe = (e: React.MouseEvent, kf:Doc) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        this.props.changeCurrentBarX(NumCast(kf.time!)); 
    }


    @action 
    private createKeyframeJSX = (kf:Doc, type = KeyframeFunc.KeyframeType.default) => {
        if (type === KeyframeFunc.KeyframeType.default){
            return (
            <div className="keyframe" style={{ left: `${NumCast(kf.time) - this.regiondata.position}px`  }}>
                {this.createDivider()}
                <div className="keyframeCircle" onPointerDown={(e) => {this.moveKeyframe(e, kf as Doc);} } onContextMenu={(e:React.MouseEvent)=>{
                    e.preventDefault(); 
                    e.stopPropagation(); 
                }}></div>
            </div>);
        }
        return (    
            <div className="keyframe" style={{ left: `${NumCast(kf.time) - this.regiondata.position}px`  }}>
                {this.createDivider()}
            </div>
        ); 
    }

    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this.regiondata.position}px)`, width: `${this.regiondata.duration}px` }} 
                onPointerDown={this.onBarPointerDown} 
                onDoubleClick={this.createKeyframe}
                onContextMenu={action((e:React.MouseEvent)=>{
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    let offsetLeft = this._bar.current!.getBoundingClientRect().left - this._bar.current!.parentElement!.getBoundingClientRect().left; 
                    let offsetTop = this._bar.current!.getBoundingClientRect().top; //+ this._bar.current!.parentElement!.getBoundingClientRect().top; 
                    this.props.setFlyout({x:offsetLeft, y: offsetTop, display:"block", regiondata:this.regiondata, regions:this.regions}); })}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    {this.regiondata.keyframes!.map(kf => {
                        return this.createKeyframeJSX(kf as Doc, (kf! as Doc).type as KeyframeFunc.KeyframeType); 
                    })}
                </div>
            </div>
        );
    }
}
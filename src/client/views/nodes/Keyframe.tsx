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

export namespace KeyframeFunc{
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
        regiondata.keyframes = new List<Doc>();
        return regiondata; 
    }; 

    export const compareKeyframe = (propsNode: Doc, kf: Doc) => {
        
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

    @action
    componentDidMount() {
        let fadeIn = this.makeKeyData(this.regiondata.position + this.regiondata.fadeIn)!; 
        let fadeOut = this.makeKeyData(this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut)!;
        let fadeInIndex = this.regiondata.keyframes!.indexOf(fadeIn); 
        let fadeOutIndex = this.regiondata.keyframes!.indexOf(fadeOut); 
       
        (fadeIn.key! as Doc).opacity = 1; 
        (fadeOut.key! as Doc).opacity = 1;  

        this.regiondata.keyframes![fadeInIndex] =fadeIn; 
        this.regiondata.keyframes![fadeOutIndex] =fadeOut; 


        let start = this.makeKeyData(this.regiondata.position)!;
        let finish = this.makeKeyData(this.regiondata.position + this.regiondata.duration)!;


        let startIndex = this.regiondata.keyframes!.indexOf(start); 
        let finishIndex = this.regiondata.keyframes!.indexOf(finish); 

        (start.key! as Doc).opacity = 0.1; 
        (finish.key! as Doc).opacity = 0.1; 
        
        this.regiondata.keyframes![startIndex] = start; 
        this.regiondata.keyframes![finishIndex] = finish; 

        
    }

    componentWillUnmount() {

    }


    @computed
    private get regiondata() {
        let index = this.regions.indexOf(this.props.RegionData);
        return RegionData(this.regions[index] as Doc);
    }

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }


    @action
    makeKeyData = (kfpos: number) => { //Kfpos is mouse offsetX, representing time 
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
            TK.key = Doc.MakeCopy(this.props.node);
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
        let bar = this._bar.current!; 
        let barX = bar.getBoundingClientRect().left;
        let offset = e.clientX - barX;
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
        } else {        
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
        this.props.changeCurrentBarX(NumCast(Math.round(position + offset))); 
    }

    @action 
    moveKeyframe = (e: React.MouseEvent, kf:Doc) => {
        e.preventDefault(); 
        e.stopPropagation(); 
        this.props.changeCurrentBarX(NumCast(kf.time!)); 
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
                    console.log(offsetLeft); 
                    console.log(offsetTop); 
                    this.props.setFlyout({x:offsetLeft, y: offsetTop, display:"block", regiondata:this.regiondata, regions:this.regions}); 
                })}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    {/* <div className="fadeLeft" style={{ width: `${this.regiondata.fadeIn}px` }}>{this.createDivider(KeyframeFunc.Direction.left)}</div>
                    <div className="fadeRight" style={{ width: `${this.regiondata.fadeOut}px` }}>{this.createDivider(KeyframeFunc.Direction.right)}</div> */}
                    
                    {this.regiondata.keyframes!.map(kf => {
                        kf = kf as Doc; 
                        return <div className="keyframe" style={{ left: `${NumCast(kf.time) - this.regiondata.position}px`  }}>
                            {this.createDivider()}
                            <div className="keyframeCircle" onPointerDown={(e) => {this.moveKeyframe(e, kf as Doc);} } onContextMenu={(e:React.MouseEvent)=>{
                                e.preventDefault(); 
                                e.stopPropagation(); 
                                
                                 }}></div>
                        </div>;
                    })}
                    {this.createDivider(KeyframeFunc.Direction.left)}
                    {this.createDivider(KeyframeFunc.Direction.right)}
                </div>
            </div>
        );
    }
}
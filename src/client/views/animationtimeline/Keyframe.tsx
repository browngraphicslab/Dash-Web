import * as React from "react";
import "./Keyframe.scss";
import "./Timeline.scss";
import "../globalCssVariables.scss";
import { observer} from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, computed, runInAction } from "mobx";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { Cast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { createSchema, defaultSpec, makeInterface, listSpec } from "../../../new_fields/Schema";
import { Transform } from "../../util/Transform";
import { InkField, StrokeData } from "../../../new_fields/InkField";
import { TimelineMenu } from "./TimelineMenu";
import { Docs } from "../../documents/Documents";
import { CollectionDockingView } from "../collections/CollectionDockingView";

export namespace KeyframeFunc {
    export enum KeyframeType {
        fade = "fade",
        default = "default",
    }
    export enum Direction {
        left = "left",
        right = "right"
    }
    export const findAdjacentRegion = (dir: KeyframeFunc.Direction, currentRegion: Doc, regions: List<Doc>): (RegionData | undefined) => {
        let leftMost: (RegionData | undefined) = undefined;
        let rightMost: (RegionData | undefined) = undefined;
        DocListCast(regions).forEach(region => {
            let neighbor = RegionData(region);
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

    export const calcMinLeft = async (region: Doc, currentBarX: number, ref?: Doc) => { //returns the time of the closet keyframe to the left
        let leftKf: (Doc | undefined) = undefined;
        let time: number = 0;
        let keyframes = await DocListCastAsync(region.keyframes!);
        keyframes!.forEach((kf) => {
            let compTime = currentBarX;
            if (ref) {
                compTime = NumCast(ref.time);
            }
            if (NumCast(kf.time) < compTime && NumCast(kf.time) >= time) {
                leftKf = kf;
                time = NumCast(kf.time);
            }
        });
        return leftKf;
    };


    export const calcMinRight = async (region: Doc, currentBarX: number, ref?: Doc) => { //returns the time of the closest keyframe to the right 
        let rightKf: (Doc | undefined) = undefined;
        let time: number = Infinity;
        let keyframes = await DocListCastAsync(region.keyframes!);
        keyframes!.forEach((kf) => {
            let compTime = currentBarX;
            if (ref) {
                compTime = NumCast(ref.time);
            }
            if (NumCast(kf.time) > compTime && NumCast(kf.time) <= NumCast(time)) {
                rightKf = kf;
                time = NumCast(kf.time);
            }
        });
        return rightKf;
    };

    export const defaultKeyframe = () => {
        let regiondata = new Doc(); //creating regiondata in MILI
        regiondata.duration = 4000;
        regiondata.position = 0;
        regiondata.fadeIn = 1000;
        regiondata.fadeOut = 1000;
        regiondata.functions = new List<Doc>(); 
        return regiondata;
    };

    export const convertPixelTime = (pos: number, unit: "mili" | "sec" | "min" | "hr", dir: "pixel" | "time", tickSpacing:number, tickIncrement:number) => {
        let time = dir === "pixel" ? (pos * tickSpacing) / tickIncrement : (pos / tickSpacing) * tickIncrement; 
        switch (unit) {
            case "mili":
                return time; 
            case "sec":
                return dir === "pixel" ? time / 1000 : time * 1000; 
            case "min":
                return dir === "pixel" ? time / 60000 : time * 60000; 
            case "hr":
                return dir === "pixel" ? time / 3600000 : time * 3600000; 
            default: 
                return time; 
        }
    };
}

export const RegionDataSchema = createSchema({
    position: defaultSpec("number", 0),
    duration: defaultSpec("number", 0),
    keyframes: listSpec(Doc),
    fadeIn: defaultSpec("number", 0),
    fadeOut: defaultSpec("number", 0),
    functions: listSpec(Doc) 
});
export type RegionData = makeInterface<[typeof RegionDataSchema]>;
export const RegionData = makeInterface(RegionDataSchema);

interface IProps {
    node: Doc;
    RegionData: Doc;
    collection: Doc;
    tickSpacing: number; 
    tickIncrement: number; 
    time: number; 
    changeCurrentBarX: (x: number) => void;
    transform: Transform;
}

@observer
export class Keyframe extends React.Component<IProps> {

    @observable private _bar = React.createRef<HTMLDivElement>();
    @observable private _gain = 20; //default
    @observable private _mouseToggled = false; 
    @observable private _doubleClickEnabled = false; 

    @computed private get regiondata() { return RegionData(this.regions[this.regions.indexOf(this.props.RegionData)] as Doc);}
    @computed private get regions() { return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;}
    @computed private get keyframes(){ return DocListCast(this.regiondata.keyframes); }
    @computed private get pixelPosition(){ return KeyframeFunc.convertPixelTime(this.regiondata.position, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement);}    
    @computed private get pixelDuration(){ return KeyframeFunc.convertPixelTime(this.regiondata.duration, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed private get pixelFadeIn() { return KeyframeFunc.convertPixelTime(this.regiondata.fadeIn, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed private get pixelFadeOut(){ return KeyframeFunc.convertPixelTime(this.regiondata.fadeOut, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed
    private get inks() {
        if (this.props.collection.data_ext) {
            let data_ext = Cast(this.props.collection.data_ext, Doc) as Doc;
            let ink = Cast(data_ext.ink, InkField) as InkField;
            if (ink) {
                return ink.inkData;
            }
        }
    }

    componentWillMount() {
        runInAction(async () => {
            if (!this.regiondata.keyframes) this.regiondata.keyframes = new List<Doc>();
            let fadeIn = await this.makeKeyData(this.regiondata.position + this.regiondata.fadeIn, KeyframeFunc.KeyframeType.fade)!;
            let fadeOut = await this.makeKeyData(this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut, KeyframeFunc.KeyframeType.fade)!;
            let start = await this.makeKeyData(this.regiondata.position, KeyframeFunc.KeyframeType.fade)!;
            let finish = await this.makeKeyData(this.regiondata.position + this.regiondata.duration, KeyframeFunc.KeyframeType.fade)!;
            (fadeIn.key! as Doc).opacity = 1;
            (fadeOut.key! as Doc).opacity = 1;
            (start.key! as Doc).opacity = 0.1;
            (finish.key! as Doc).opacity = 0.1;
        }); 
    }

    @action
    makeKeyData = async (kfpos: number, type: KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        let doclist = (await DocListCastAsync(this.regiondata.keyframes))!;
        let existingkf: (Doc | undefined) = undefined;
        doclist.forEach(TK => {
            if (TK.time === kfpos) existingkf = TK;
        });
        if (existingkf) return existingkf;
        let TK: Doc = new Doc();
        TK.time = kfpos;
        TK.key = Doc.MakeCopy(this.props.node, true);
        TK.type = type;            
        this.regiondata.keyframes!.push(TK);

        let interpolationFunctions = new Doc(); 
        interpolationFunctions.interpolationX = new List<number>([0, 1]); 
        interpolationFunctions.interpolationY = new List<number>([0,100]); 
        interpolationFunctions.pathX = new List<number>(); 
        interpolationFunctions.pathY = new List<number>(); 

        this.regiondata.functions!.push(interpolationFunctions); 
        let found:boolean = false; 
        this.regiondata.keyframes!.forEach(compkf => {
            compkf = compkf as Doc; 
            if (kfpos < NumCast(compkf.time) && !found) {
                runInAction(() => {
                    this.regiondata.keyframes!.splice(doclist.indexOf(compkf as Doc), 0, TK);
                    this.regiondata.keyframes!.pop(); 
                    found = true; 
                }); 
                return; 
            }
        });
        return TK;
    }

    
    @action
    onBarPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let clientX = e.clientX;  
        if (this._doubleClickEnabled){
            this.createKeyframe(clientX); 
            this._doubleClickEnabled = false; 
        } else {
            setTimeout(() => {if(!this._mouseToggled && this._doubleClickEnabled)this.props.changeCurrentBarX(this.pixelPosition + (clientX - this._bar.current!.getBoundingClientRect().left) * this.props.transform.Scale); 
                this._mouseToggled = false;            
                this._doubleClickEnabled = false; }, 200); 
            this._doubleClickEnabled = true; 
            document.addEventListener("pointermove", this.onBarPointerMove);
            document.addEventListener("pointerup", (e: PointerEvent) => {
                document.removeEventListener("pointermove", this.onBarPointerMove);
            });
        }
    }


    @action
    onBarPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.movementX !== 0) {
            this._mouseToggled = true; 
        }
        let left = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions)!;
        let right = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions!);
        let prevX = this.regiondata.position;
        let futureX = this.regiondata.position + KeyframeFunc.convertPixelTime(e.movementX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        if (futureX <= 0) {
            this.regiondata.position = 0;
        } else if ((left && left.position + left.duration >= futureX)) {
            this.regiondata.position = left.position + left.duration;
        } else if ((right && right.position <= futureX + this.regiondata.duration)) {
            this.regiondata.position = right.position - this.regiondata.duration;
        } else {
            this.regiondata.position = futureX;
        }            
        let movement = this.regiondata.position - prevX; 
        this.keyframes.forEach(kf => {
            kf.time = NumCast(kf.time) + movement; 
        });
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
        let offset = KeyframeFunc.convertPixelTime(Math.round((e.clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        let leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions);
        let firstkf: (Doc | undefined) = this.keyframes[0];
        if (firstkf && this.regiondata.position + this.regiondata.fadeIn + offset >= NumCast(firstkf!.time)) {
            let dif = NumCast(firstkf!.time) - (this.pixelPosition + this.pixelFadeIn);
            this.regiondata.position = NumCast(firstkf!.time) - this.regiondata.fadeIn;
            this.regiondata.duration -= dif;
        } else if (this.regiondata.duration - offset < this.regiondata.fadeIn + this.regiondata.fadeOut) { // no keyframes, just fades
            this.regiondata.position -= (this.regiondata.fadeIn + this.regiondata.fadeOut - this.regiondata.duration);
            this.regiondata.duration = this.regiondata.fadeIn + this.regiondata.fadeOut;
        } else if (leftRegion && this.regiondata.position + offset <= leftRegion.position + leftRegion.duration) {  
            let dif = this.regiondata.position - (leftRegion.position + leftRegion.duration);
            this.regiondata.position = leftRegion.position + leftRegion.duration;
            this.regiondata.duration += dif;
        } else {
            this.regiondata.duration -= offset;
            this.regiondata.position += offset;
        }
        // this.keyframes[0].time = this.regiondata.position; 
        // this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn; 
    }


    @action
    onDragResizeRight = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let offset = KeyframeFunc.convertPixelTime(Math.round((e.clientX - bar.getBoundingClientRect().right) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions);
        console.log(offset); 
        console.log(this.keyframes[this.keyframes.length - 3].time); 
        console.log(this.regiondata.position + this.regiondata.duration - offset); 
        if (this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut - offset <= NumCast(this.keyframes[this.keyframes.length - 3].time)) {
            console.log("HI"); 
        } else {
            this.regiondata.duration += offset;
        }
        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut; 
        this.keyframes[this.keyframes.length - 1].time = this.regiondata.position + this.regiondata.duration; 
       
    }

    @action
    createKeyframe = async (clientX:number) => {
        this._mouseToggled = true; 
        let bar = this._bar.current!;
        let offset = KeyframeFunc.convertPixelTime(Math.round((clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        if (offset > this.regiondata.fadeIn && offset < this.regiondata.duration - this.regiondata.fadeOut) { //make sure keyframe is not created inbetween fades and ends
            let position = this.regiondata.position;
            await this.makeKeyData(Math.round(position + offset));
            this.props.changeCurrentBarX(KeyframeFunc.convertPixelTime(Math.round(position + offset), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement)); //first move the keyframe to the correct location and make a copy so the correct file gets coppied
        }
    }


    @action
    moveKeyframe = async (e: React.MouseEvent, kf: Doc) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.changeCurrentBarX(KeyframeFunc.convertPixelTime(NumCast(kf.time!), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement));
    }


    @action
    onKeyframeOver = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.node.backgroundColor = "#000000";
    }

    @action 
    makeKeyframeMenu = (kf :Doc, e:MouseEvent) => {
        TimelineMenu.Instance.addItem("button", "Show Data", () => {
        runInAction(() => {let kvp = Docs.Create.KVPDocument(Cast(kf.key, Doc) as Doc, { width: 300, height: 300 }); 
            CollectionDockingView.AddRightSplit(kvp, (kf.key as Doc).data as Doc); });
        }), 
        TimelineMenu.Instance.addItem("button", "Delete", () => {
            runInAction(() => {
                (this.regiondata.keyframes as List<Doc>).splice(this.keyframes.indexOf(kf), 1);
            });         
        }), 
        TimelineMenu.Instance.addItem("input", "Move", (val) => {
            runInAction(() => {
                if (this.checkInput(val)){
                    let cannotMove:boolean = false; 
                    let kfIndex:number = this.keyframes.indexOf(kf); 
                    if (val < 0 ||( val < NumCast(this.keyframes[kfIndex - 1].time) || val > NumCast(this.keyframes[kfIndex + 1].time)) ){
                        cannotMove = true; 
                    }
                    if (!cannotMove){
                        this.keyframes[kfIndex].time = parseInt(val, 10); 
                        this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn; 
                    }
                }
              });  
            });
        TimelineMenu.Instance.addMenu("Keyframe"); 
        TimelineMenu.Instance.openMenu(e.clientX, e.clientY); 
    }

    @action 
    makeRegionMenu = (kf: Doc, e: MouseEvent) => {
        TimelineMenu.Instance.addItem("button", "Add Ease", () => {
            // this.onContainerDown(kf, "interpolate");
        }),
        TimelineMenu.Instance.addItem("button", "Add Path", () => {
            // this.onContainerDown(kf, "path");
        }),         
        TimelineMenu.Instance.addItem("button", "Remove Region", ()=>{this.regions.splice(this.regions.indexOf(this.regiondata), 1);}),
        TimelineMenu.Instance.addItem("input", `fadeIn: ${this.regiondata.fadeIn}ms`, (val) => {
            runInAction(() => {
                if (this.checkInput(val)){
                    let cannotMove:boolean = false; 
                    if (val < 0 || val > NumCast(this.keyframes[2].time) - this.regiondata.position){
                        cannotMove = true; 
                    }
                    if (!cannotMove){
                        this.regiondata.fadeIn = parseInt(val, 10); 
                        this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn; 
                    }
                }
        });}), 
        TimelineMenu.Instance.addItem("input", `fadeOut: ${this.regiondata.fadeOut}ms`, (val) => {
            runInAction(() => {
                if (this.checkInput(val)){
                    let cannotMove:boolean = false; 
                    if (val < 0 || val > this.regiondata.position + this.regiondata.duration - NumCast(this.keyframes[this.keyframes.length - 3].time)){
                        cannotMove = true; 
                    } 
                    if (!cannotMove){
                        this.regiondata.fadeOut = parseInt(val, 10); 
                        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - val; 
                    }
                }
        });}),
        TimelineMenu.Instance.addItem("input", `position: ${this.regiondata.position}ms`, (val) => {
            runInAction(() => {
            if (this.checkInput(val)){           
                let prevPosition = this.regiondata.position;  
                let cannotMove:boolean = false;  
                DocListCast(this.regions).forEach(region => {
                    if (NumCast(region.position) !== this.regiondata.position){
                        if ((val < 0) || (val > NumCast(region.position) && val < NumCast(region.position) + NumCast(region.duration) || (this.regiondata.duration + val > NumCast(region.position) && this.regiondata.duration + val < NumCast(region.position) + NumCast(region.duration)))){
                            cannotMove = true;
                        }
                    }
                });
                if (!cannotMove) {
                    this.regiondata.position = parseInt(val, 10);    
                    this.updateKeyframes(this.regiondata.position - prevPosition ); 
                }
            }
        });}),
        TimelineMenu.Instance.addItem("input", `duration: ${this.regiondata.duration}ms`, (val) => {
            runInAction(() => {
                if (this.checkInput(val)){           
                    let cannotMove:boolean = false;  
                    DocListCast(this.regions).forEach(region => {
                        if (NumCast(region.position) !== this.regiondata.position){
                            val += this.regiondata.position; 
                            if ((val < 0 ) || (val > NumCast(region.position) && val < NumCast(region.position) + NumCast(region.duration))){
                                cannotMove = true;
                            }
                        }
                    });
                    if (!cannotMove) {
                        this.regiondata.duration = parseInt(val, 10);
                        this.keyframes[this.keyframes.length - 1].time = this.regiondata.position + this.regiondata.duration; 
                        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut; 
                    }
                }
        });}),
        TimelineMenu.Instance.addMenu("Region"); 
        TimelineMenu.Instance.openMenu(e.clientX, e.clientY); 
    }

    @action
    checkInput = (val: any) => {
        return typeof(val === "number"); 
    }

    @action
    updateKeyframes = (incr:number, filter:number[] = []) => {
        this.keyframes.forEach(kf => {
            if (!filter.includes(this.keyframes.indexOf(kf))){
                kf.time = NumCast(kf.time) + incr; 
            }
        });
    }

    @action
    onContainerOver = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        let div = ref.current!;
        div.style.opacity = "1";
        Doc.BrushDoc(this.props.node); 
    }

    @action
    onContainerOut = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        let div = ref.current!;
        div.style.opacity = "0";
        Doc.UnBrushDoc(this.props.node); 
    }


    private _reac: (undefined | IReactionDisposer) = undefined;
    private _plotList: ([string, StrokeData] | undefined) = undefined;
    private _interpolationKeyframe: (Doc | undefined) = undefined; 
    private _type: string = ""; 

    @action
    onContainerDown = (kf: Doc, type: string) => {
        let listenerCreated = false;                 
        this._type = type; 
        this.props.collection.backgroundColor = "rgb(0,0,0)";
        this._reac = reaction(() => {
            return this.inks;
        }, data => {
            if (!listenerCreated) {
                this._plotList = Array.from(data!)[data!.size - 1]!;
                this._interpolationKeyframe = kf; 
                document.addEventListener("pointerup", this.onReactionListen); 
                listenerCreated = true; 
            }
        });
    }

    @action
    onReactionListen = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let message = prompt("GRAPHING MODE: Enter gain");      
        if (message) {
            let messageContent = parseInt(message, 10); 
            if (messageContent === NaN) {
                this._gain = Infinity; 
            } else {
                this._gain = messageContent; 
            }
        
        }   
        if (this._reac && this._plotList && this._interpolationKeyframe) {
            this.props.collection.backgroundColor = "#FFF";
            this._reac();
            let xPlots = new List<number>();
            let yPlots = new List<number>();
            let maxY = 0;
            let minY = Infinity;
            let pathData = this._plotList![1].pathData;
            for (let i = 0; i < pathData.length - 1;) {
                let val = pathData[i];
                if (val.y > maxY) {
                    maxY = val.y;
                }
                if (val.y < minY) {
                    minY = val.y;
                }
                xPlots.push(val.x);
                yPlots.push(val.y);
                let increment = Math.floor(pathData.length / this._gain);
                if (pathData.length > this._gain) {
                    if (i + increment < pathData.length) {
                        i = i + increment;
                    } else {
                        i = pathData.length - 1;
                    }
                } else {
                    i++;
                } 
            }
            let index = this.keyframes.indexOf(this._interpolationKeyframe!); 
            if (this._type === "interpolate"){
                (Cast(this.regiondata.functions![index], Doc) as Doc).interpolationX = xPlots;
                (Cast(this.regiondata.functions![index], Doc) as Doc).interpolationY = yPlots;
            } else if (this._type === "path") {
                (Cast(this.regiondata.functions![index], Doc) as Doc).pathX = xPlots;
                (Cast(this.regiondata.functions![index], Doc) as Doc).pathY = yPlots;
            }
            this._reac = undefined; 
            this._interpolationKeyframe = undefined; 
            this._plotList = undefined; 
            this._type = ""; 
            document.removeEventListener("pointerup", this.onReactionListen); 
        }
    }

    @action
    drawKeyframes = () => {
        let keyframeDivs:JSX.Element[] = []; 
        this.keyframes.forEach( kf => {
            if (kf.type as KeyframeFunc.KeyframeType === KeyframeFunc.KeyframeType.default) {
                keyframeDivs.push(
                    <div className="keyframe" style={{ left: `${KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement) - this.pixelPosition}px` }}>
                        <div className="divider"></div>
                        <div className="keyframeCircle" onPointerDown={(e) => { this.moveKeyframe(e, kf); }} onContextMenu={(e: React.MouseEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            this.makeKeyframeMenu(kf, e.nativeEvent); 
                        }}></div>
                    </div>
                );
            }
            else {
                keyframeDivs.push(
                    <div className="keyframe" style={{ left: `${KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement) - this.pixelPosition}px` }}>
                        <div className="divider"></div>
                    </div>
                );
            }
        });
        return keyframeDivs; 
    }

    @action 
    drawKeyframeDividers = () => {
        let keyframeDividers:JSX.Element[] = []; 
        this.keyframes.forEach(kf => {
            if(this.keyframes.indexOf(kf ) !== this.keyframes.length - 1) {
                let left = this.keyframes[this.keyframes.indexOf(kf) + 1]; 
                let bodyRef = React.createRef<HTMLDivElement>(); 
                let kfPos = KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); 
                let leftPos = KeyframeFunc.convertPixelTime(NumCast(left!.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); 
                return (
                    <div ref={bodyRef}className="body-container" style={{left: `${kfPos - this.pixelPosition}px`, width:`${leftPos - kfPos}px`}}
                    onPointerOver={(e) => { this.onContainerOver(e, bodyRef); }}
                    onPointerOut={(e) => { this.onContainerOut(e, bodyRef); }}
                    onContextMenu={(e) => {
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        this._mouseToggled = true; 
                        this.makeRegionMenu(kf, e.nativeEvent); 
                    }}>
                    </div>
                ); 
            }  
        }); 
        return keyframeDividers; 
    }

    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this.pixelPosition}px)`, 
                width: `${this.pixelDuration}px`, 
                background: `linear-gradient(90deg, rgba(77, 153, 0, 0) 0%, rgba(77, 153, 0, 1) ${this.pixelFadeIn / this.pixelDuration * 100}%, rgba(77, 153, 0, 1) ${(this.pixelDuration - this.pixelFadeOut) / this.pixelDuration * 100}%, rgba(77, 153, 0, 0) 100% )` }}
                    onPointerDown={this.onBarPointerDown}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    {this.drawKeyframes()}
                    {this.drawKeyframeDividers()}
                </div>
            </div>
        );
    }
}
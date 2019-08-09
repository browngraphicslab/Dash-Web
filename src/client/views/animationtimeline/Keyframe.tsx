import * as React from "react";
import "./Keyframe.scss";
import "./Timeline.scss";
import "../globalCssVariables.scss";
import { observer, Observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, IObservableArray, computed, toJS, isComputedProp, runInAction } from "mobx";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { Cast, FieldValue, StrCast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { createSchema, defaultSpec, makeInterface, listSpec } from "../../../new_fields/Schema";
import { FlyoutProps } from "./Timeline";
import { Transform } from "../../util/Transform";
import { InkField, StrokeData } from "../../../new_fields/InkField";
import { TimelineMenu } from "./TimelineMenu";
import { Docs } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
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
        let regiondata = new Doc(); //creating regiondata
        regiondata.duration = 200;
        regiondata.position = 0;
        regiondata.fadeIn = 20;
        regiondata.fadeOut = 20;
        regiondata.functions = new List<Doc>(); 
        return regiondata;
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
    changeCurrentBarX: (x: number) => void;
    setFlyout: (props: FlyoutProps) => any;
    transform: Transform;
}

@observer
export class Keyframe extends React.Component<IProps> {

    @observable private _bar = React.createRef<HTMLDivElement>();
    @observable private _gain = 20; //default

    @computed
    private get regiondata() {
        let index = this.regions.indexOf(this.props.RegionData);
        return RegionData(this.regions[index] as Doc);
    }

    @computed
    private get regions() {
        return Cast(this.props.node.regions, listSpec(Doc)) as List<Doc>;
    }

    @computed
    private get firstKeyframe() {
        let first: (Doc | undefined) = undefined;
        DocListCast(this.regiondata.keyframes!).forEach(kf => {
            if (kf.type !== KeyframeFunc.KeyframeType.fade) {
                if (!first || first && NumCast(kf.time) < NumCast(first.time)) {
                    first = kf;
                }
            }
        });
        return first;
    }

    @computed
    private get lastKeyframe() {
        let last: (Doc | undefined) = undefined;
        DocListCast(this.regiondata.keyframes!).forEach(kf => {
            if (kf.type !== KeyframeFunc.KeyframeType.fade) {
                if (!last || last && NumCast(kf.time) > NumCast(last.time)) {
                    last = kf;
                }
            }
        });
        return last;
    }
    @computed
    private get keyframes(){
        return DocListCast(this.regiondata.keyframes); 
    }

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

    async componentWillMount() {
        if (!this.regiondata.keyframes) {
            this.regiondata.keyframes = new List<Doc>();
        }
        let fadeIn = await this.makeKeyData(this.regiondata.position + this.regiondata.fadeIn, KeyframeFunc.KeyframeType.fade)!;
        let fadeOut = await this.makeKeyData(this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut, KeyframeFunc.KeyframeType.fade)!;
        let start = await this.makeKeyData(this.regiondata.position, KeyframeFunc.KeyframeType.fade)!;
        let finish = await this.makeKeyData(this.regiondata.position + this.regiondata.duration, KeyframeFunc.KeyframeType.fade)!;
        (fadeIn.key! as Doc).opacity = 1;
        (fadeOut.key! as Doc).opacity = 1;
        (start.key! as Doc).opacity = 0.1;
        (finish.key! as Doc).opacity = 0.1;

        observe(this.regiondata, change => {
            if (change.type === "update") {
                fadeIn.time = this.regiondata.position + this.regiondata.fadeIn;
                fadeOut.time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut;
                start.time = this.regiondata.position;
                finish.time = this.regiondata.position + this.regiondata.duration;
                this.regiondata.keyframes![this.regiondata.keyframes!.indexOf(fadeIn)] = fadeIn;
                this.regiondata.keyframes![this.regiondata.keyframes!.indexOf(fadeOut)] = fadeOut;
                this.regiondata.keyframes![this.regiondata.keyframes!.indexOf(start)] = start;
                this.regiondata.keyframes![this.regiondata.keyframes!.indexOf(finish)] = finish;
                this.forceUpdate();
            }
        });
    }

    @action
    makeKeyData = async (kfpos: number, type: KeyframeFunc.KeyframeType = KeyframeFunc.KeyframeType.default) => { //Kfpos is mouse offsetX, representing time 
        let doclist = (await DocListCastAsync(this.regiondata.keyframes))!;
        let existingkf: (Doc | undefined) = undefined;
        doclist.forEach(TK => {
            TK = TK as Doc;
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
            if ((this.regiondata.keyframes![i] as Doc).type !== KeyframeFunc.KeyframeType.fade) {
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
        let offset = Math.round((e.clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale);
        let leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions);
        let firstkf: (Doc | undefined) = this.firstKeyframe;
        if (firstkf && this.regiondata.position + this.regiondata.fadeIn + offset >= NumCast(firstkf!.time)) {
            let dif = NumCast(firstkf!.time) - (this.regiondata.position + this.regiondata.fadeIn);
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
    }


    @action
    onDragResizeRight = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let offset = Math.round((e.clientX - bar.getBoundingClientRect().right) * this.props.transform.Scale);
        let rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions);
        if (this.lastKeyframe! && this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut + offset <= NumCast((this.lastKeyframe! as Doc).time)) {
            let dif = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut - NumCast((this.lastKeyframe! as Doc).time);
            this.regiondata.duration -= dif;
        } else if (this.regiondata.duration + offset < this.regiondata.fadeIn + this.regiondata.fadeOut) { // nokeyframes, just fades
            this.regiondata.duration = this.regiondata.fadeIn + this.regiondata.fadeOut;
        } else if (rightRegion && this.regiondata.position + this.regiondata.duration + offset >= rightRegion.position) {
            let dif = rightRegion.position - (this.regiondata.position + this.regiondata.duration);
            this.regiondata.duration += dif;
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
    createKeyframe = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let offset = Math.round((e.clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale);
        if (offset > this.regiondata.fadeIn && offset < this.regiondata.duration - this.regiondata.fadeOut) { //make sure keyframe is not created inbetween fades and ends
            let position = NumCast(this.regiondata.position);
            await this.makeKeyData(Math.round(position + offset));
            console.log(this.regiondata.keyframes!.length);
            this.props.changeCurrentBarX(NumCast(Math.round(position + offset))); //first move the keyframe to the correct location and make a copy so the correct file gets coppied
        }
    }


    @action
    moveKeyframe = async (e: React.MouseEvent, kf: Doc) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.changeCurrentBarX(NumCast(kf.time!));
    }


    @action
    onKeyframeOver = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.node.backgroundColor = "#000000";

    }
    @action
    private createKeyframeJSX = (kf: Doc, type = KeyframeFunc.KeyframeType.default) => {
        if (type === KeyframeFunc.KeyframeType.default) {
            return (
                <div className="keyframe" style={{ left: `${NumCast(kf.time) - this.regiondata.position}px` }}>
                    {this.createDivider()}
                    <div className="keyframeCircle" onPointerDown={(e) => { this.moveKeyframe(e, kf as Doc); }} onContextMenu={(e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        let items = [
                            TimelineMenu.Instance.addItem("button", "Show Data", () => {
                            runInAction(() => {let kvp = Docs.Create.KVPDocument(Cast(kf.key, Doc) as Doc, { width: 300, height: 300 }); 
                            CollectionDockingView.Instance.AddRightSplit(kvp, (kf.key as Doc).data as Doc); });
                           }), 
                            TimelineMenu.Instance.addItem("button", "Delete", () => {}), 
                            TimelineMenu.Instance.addItem("input", "Move", (val) => {kf.time = parseInt(val, 10);})  
                        ]; 
                        TimelineMenu.Instance.addMenu("Keyframe", items); 
                        TimelineMenu.Instance.openMenu(e.clientX, e.clientY); 
                    }}></div>
                </div>);
        }
        return (
            <div className="keyframe" style={{ left: `${NumCast(kf.time) - this.regiondata.position}px` }}>
                {this.createDivider()}
            </div>
        );
    }

    onContainerOver = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        let div = ref.current!;
        div.style.opacity = "1";
    }

    onContainerOut = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        let div = ref.current!;
        div.style.opacity = "0";
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
    render() {
        return (
            <div>
                <div className="bar" ref={this._bar} style={{ transform: `translate(${this.regiondata.position}px)`, width: `${this.regiondata.duration}px`, background: `linear-gradient(90deg, rgba(77, 153, 0, 0) 0%, rgba(77, 153, 0, 1) ${this.regiondata.fadeIn / this.regiondata.duration * 100}%, rgba(77, 153, 0, 1) ${(this.regiondata.duration - this.regiondata.fadeOut) / this.regiondata.duration * 100}%, rgba(77, 153, 0, 0) 100% )` }}
                    onPointerDown={this.onBarPointerDown}
                    onDoubleClick={this.createKeyframe}>
                    <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                    <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                    {this.regiondata.keyframes!.map(kf => {
                        return this.createKeyframeJSX(kf as Doc, (kf! as Doc).type as KeyframeFunc.KeyframeType);
                    })}
                    {this.keyframes.map( kf => {
                       if(this.keyframes.indexOf(kf ) !== this.keyframes.length - 1) {
                            let left = this.keyframes[this.keyframes.indexOf(kf) + 1]; 
                            let bodyRef = React.createRef<HTMLDivElement>(); 
                            return (
                                <div ref={bodyRef}className="body-container" style={{left: `${NumCast(kf.time) - this.regiondata.position}px`, width:`${NumCast(left!.time) - NumCast(kf.time)}px`}}
                                onPointerOver={(e) => { this.onContainerOver(e, bodyRef); }}
                                onPointerOut={(e) => { this.onContainerOut(e, bodyRef); }}
                                onPointerDown={(e) => { this.props.changeCurrentBarX(NumCast(kf.time) + (e.clientX - bodyRef.current!.getBoundingClientRect().left) * this.props.transform.Scale);}}
                                onContextMenu={(e) => {
                                    let items = [
                                        TimelineMenu.Instance.addItem("button", "Add Ease", () => {this.onContainerDown(kf, "interpolate");}),
                                        TimelineMenu.Instance.addItem("button", "Add Path", () => {this.onContainerDown(kf, "path");}), 
                                        TimelineMenu.Instance.addItem("input", "fadeIn", (val) => {this.regiondata.fadeIn = parseInt(val, 10);}), 
                                        TimelineMenu.Instance.addItem("input", "fadeOut", (val) => {this.regiondata.fadeOut = parseInt(val, 10);}),
                                        TimelineMenu.Instance.addItem("input", "position", (val) => {this.regiondata.position = parseInt(val, 10);}),
                                        TimelineMenu.Instance.addItem("input", "duration", (val) => {this.regiondata.duration = parseInt(val, 10);}),
                                    ]; 
                                    TimelineMenu.Instance.addMenu("Region", items); 
                                    TimelineMenu.Instance.openMenu(e.clientX, e.clientY); 
                                }}>
                                </div>
                            ); 
                       }  
                    })}

                </div>
            </div>
        );
    }
}
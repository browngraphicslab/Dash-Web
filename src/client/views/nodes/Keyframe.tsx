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
import { exportDefaultSpecifier } from "babel-types";

enum Direction {
    left = "left",
    right = "right"
}

interface IProp {
    node: Doc;
    RegionData: Doc;
    setFlyout:(props:FlyoutProps) => any; 
}


const KeyframeDataSchema = createSchema({
    time: defaultSpec("number", 0),
    key: Doc
});
type KeyframeData = makeInterface<[typeof KeyframeDataSchema]>;
const KeyframeData = makeInterface(KeyframeDataSchema);


const RegionDataSchema = createSchema({
    position: defaultSpec("number", 0),
    duration: defaultSpec("number", 0),
    keyframes: listSpec(Doc)
});
type RegionData = makeInterface<[typeof RegionDataSchema]>;
export const RegionData = makeInterface(RegionDataSchema);


@observer
export class Keyframe extends React.Component<IProp> {

    @observable private _display: string = "none";
    @observable private _bar = React.createRef<HTMLDivElement>();
    @observable private _keyframes: number[] = [];
    @observable private position: number = 0;
    @observable private fadein: number = 0;
    @observable private fadeout: number = 0;

    @action
    componentDidMount() {

        // need edge case here when keyframe data already exists when loading.....................;
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
        }

    }

    @action
    onBarPointerDown = (e: React.PointerEvent) => {
        let mouse = e.nativeEvent; 
        
        e.preventDefault();
        e.stopPropagation();
        if (mouse.which === 1){
            document.addEventListener("pointermove", this.onBarPointerMove);
            document.addEventListener("pointerup", (e: PointerEvent) => {
                document.removeEventListener("pointermove", this.onBarPointerMove);
            });
        } else if(mouse.which === 3) {
            e.preventDefault();
            e.stopPropagation();        
            let bar = this._bar.current!; 
            this.props.setFlyout({x:this.regiondata.position + 130, y: bar.getBoundingClientRect().bottom,display:"block", time: this.regiondata.position, duration:this.regiondata.duration}); 
            let removeFlyout = (e:PointerEvent) => {
                 if (e.which === 1){
                    console.log("wut"); 
                    this.props.setFlyout({display:"none"});                 
                    document.removeEventListener("pointerdown", removeFlyout); 
                }
            }; 
            document.addEventListener("pointerdown", removeFlyout); 
        }
    }

    @action
    onBarPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let left = this.findAdjacentRegion(Direction.left);
        let right = this.findAdjacentRegion(Direction.right);        
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
    findAdjacentRegion = (dir: Direction): (RegionData | undefined) => {
        let leftMost: (RegionData | undefined) = undefined;
        let rightMost: (RegionData | undefined) = undefined;
        this.regions.forEach(region => {
            let neighbor = RegionData(region as Doc);
            if (this.regiondata.position > neighbor.position) {
                if (!leftMost || neighbor.position > leftMost.position) {
                    leftMost = neighbor;
                }
            } else if (this.regiondata.position < neighbor.position) {
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
        this.regiondata.duration -= offset;
        this.regiondata.position += offset;
        this.regiondata.keyframes!.forEach(kf => {
            kf = kf as Doc;
            kf.time = NumCast(kf.time) + offset;
        }); 
    }


    @action
    onDragResizeRight = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        let bar = this._bar.current!;
        let barX = bar.getBoundingClientRect().right;
        let offset = e.clientX - barX;
        console.log(offset);
        this.regiondata.duration += offset;
    }

    createDivider = (type?: string): JSX.Element => {
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
        let mouse = e.nativeEvent;
        let position = NumCast(this.regiondata.position);
        this._keyframes.push(mouse.offsetX);
        this.makeKeyData(position + mouse.offsetX);
    }



    render() {
        return (
            <div>
                    <div className="bar" ref={this._bar} style={{ transform: `translate(${this.regiondata.position}px)`, width: `${this.regiondata.duration}px` }} 
                    onPointerDown={this.onBarPointerDown} 
                    onDoubleClick={this.createKeyframe}>
                        <div className="leftResize" onPointerDown={this.onResizeLeft} ></div>
                        <div className="rightResize" onPointerDown={this.onResizeRight}></div>
                        <div className="fadeLeft" style={{ width: `${20}px` }}>{this.createDivider("left")}</div>
                        <div className="fadeRight" style={{ width: `${20}px` }}>{this.createDivider("right")}</div>
                        {this._keyframes.map(kf => {
                            return <div className="keyframe" style={{ left: `${kf}px` }}>
                                {this.createDivider()}
                                <div className="keyframeCircle"></div>
                            </div>;
                        })}
                        {this.createDivider("left")}
                        {this.createDivider("right")}
                    </div>
            </div>
        );
    }
}
import * as React from "react";
import "./Keyframe.scss";
import "./Timeline.scss";
import "../globalCssVariables.scss";
import { observer } from "mobx-react";
import { observable, reaction, action, IReactionDisposer, observe, computed, runInAction, trace } from "mobx";
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../fields/Doc";
import { Cast, NumCast } from "../../../fields/Types";
import { List } from "../../../fields/List";
import { createSchema, defaultSpec, makeInterface, listSpec } from "../../../fields/Schema";
import { Transform } from "../../util/Transform";
import { TimelineMenu } from "./TimelineMenu";
import { Docs } from "../../documents/Documents";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { emptyPath } from "../../../Utils";


/**
 * Useful static functions that you can use. Mostly for logic, but you can also add UI logic here also 
 */
export namespace KeyframeFunc {

    export enum KeyframeType {
        end = "end",
        fade = "fade",
        default = "default",
    }

    export enum Direction {
        left = "left",
        right = "right"
    }

    export const findAdjacentRegion = (dir: KeyframeFunc.Direction, currentRegion: Doc, regions: Doc[]): (RegionData | undefined) => {
        let leftMost: (RegionData | undefined) = undefined;
        let rightMost: (RegionData | undefined) = undefined;
        regions.forEach(region => {
            const neighbor = RegionData(region);
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

    export const calcMinLeft = (region: Doc, currentBarX: number, ref?: Doc) => { //returns the time of the closet keyframe to the left
        let leftKf: Opt<Doc>;
        let time: number = 0;
        const keyframes = DocListCast(region.keyframes!);
        keyframes.map((kf) => {
            let compTime = currentBarX;
            if (ref) compTime = NumCast(ref.time);
            if (NumCast(kf.time) < compTime && NumCast(kf.time) >= time) {
                leftKf = kf;
                time = NumCast(kf.time);
            }
        });
        return leftKf;
    };


    export const calcMinRight = (region: Doc, currentBarX: number, ref?: Doc) => { //returns the time of the closest keyframe to the right 
        let rightKf: Opt<Doc>;
        let time: number = Infinity;
        DocListCast(region.keyframes!).forEach((kf) => {
            let compTime = currentBarX;
            if (ref) compTime = NumCast(ref.time);
            if (NumCast(kf.time) > compTime && NumCast(kf.time) <= NumCast(time)) {
                rightKf = kf;
                time = NumCast(kf.time);
            }
        });
        return rightKf;
    };

    export const defaultKeyframe = () => {
        const regiondata = new Doc(); //creating regiondata in MILI
        regiondata.duration = 4000;
        regiondata.position = 0;
        regiondata.fadeIn = 1000;
        regiondata.fadeOut = 1000;
        regiondata.functions = new List<Doc>();
        regiondata.hasData = false;
        return regiondata;
    };


    export const convertPixelTime = (pos: number, unit: "mili" | "sec" | "min" | "hr", dir: "pixel" | "time", tickSpacing: number, tickIncrement: number) => {
        const time = dir === "pixel" ? (pos * tickSpacing) / tickIncrement : (pos / tickSpacing) * tickIncrement;
        switch (unit) {
            case "mili": return time;
            case "sec": return dir === "pixel" ? time / 1000 : time * 1000;
            case "min": return dir === "pixel" ? time / 60000 : time * 60000;
            case "hr": return dir === "pixel" ? time / 3600000 : time * 3600000;
            default: return time;
        }
    };
}

export const RegionDataSchema = createSchema({
    position: defaultSpec("number", 0),
    duration: defaultSpec("number", 0),
    keyframes: listSpec(Doc),
    fadeIn: defaultSpec("number", 0),
    fadeOut: defaultSpec("number", 0),
    functions: listSpec(Doc),
    hasData: defaultSpec("boolean", false)
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
    makeKeyData: (region: RegionData, pos: number, kftype: KeyframeFunc.KeyframeType) => Doc;
}


/**
 * 
 * This class handles the green region stuff
 * Key facts:
 * 
 * Structure looks like this
 * 
 * region as a whole
 *  <------------------------------REGION------------------------------->
 * 
 * region broken down 
 * 
 *  <|---------|############ MAIN CONTENT #################|-----------|>      .....followed by void.........
 *  (start)                                             (Fade 2)
 *            (fade 1)                                              (finish)
 * 
 * 
 * As you can see, this is different from After Effect and Premiere Pro, but this is how TAG worked. 
 * If you want to checkout TAG, it's in the lockers, and the password is the usual lab door password. It's the blue laptop.  
 * If you want to know the exact location of the computer, message me. 
 * 
 * @author Andrew Kim 
 */
@observer
export class Keyframe extends React.Component<IProps> {

    @observable private _bar = React.createRef<HTMLDivElement>();
    @observable private _mouseToggled = false;
    @observable private _doubleClickEnabled = false;

    @computed private get regiondata() { return RegionData(this.props.RegionData); }
    @computed private get regions() { return DocListCast(this.props.node.regions); }
    @computed private get keyframes() { return DocListCast(this.regiondata.keyframes); }
    @computed private get pixelPosition() { return KeyframeFunc.convertPixelTime(this.regiondata.position, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed private get pixelDuration() { return KeyframeFunc.convertPixelTime(this.regiondata.duration, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed private get pixelFadeIn() { return KeyframeFunc.convertPixelTime(this.regiondata.fadeIn, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }
    @computed private get pixelFadeOut() { return KeyframeFunc.convertPixelTime(this.regiondata.fadeOut, "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement); }

    constructor(props: any) {
        super(props);
    }
    componentDidMount() {
        setTimeout(() => {      //giving it a temporary 1sec delay... 
            if (!this.regiondata.keyframes) this.regiondata.keyframes = new List<Doc>();
            const start = this.props.makeKeyData(this.regiondata, this.regiondata.position, KeyframeFunc.KeyframeType.end);
            const fadeIn = this.props.makeKeyData(this.regiondata, this.regiondata.position + this.regiondata.fadeIn, KeyframeFunc.KeyframeType.fade);
            const fadeOut = this.props.makeKeyData(this.regiondata, this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut, KeyframeFunc.KeyframeType.fade);
            const finish = this.props.makeKeyData(this.regiondata, this.regiondata.position + this.regiondata.duration, KeyframeFunc.KeyframeType.end);
            fadeIn.opacity = 1;
            fadeOut.opacity = 1;
            start.opacity = 0.1;
            finish.opacity = 0.1;
            this.forceUpdate(); //not needed, if setTimeout is gone...
        }, 1000);
    }

    @action
    onBarPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const clientX = e.clientX;
        if (this._doubleClickEnabled) {
            this.createKeyframe(clientX);
            this._doubleClickEnabled = false;
        } else {
            setTimeout(() => {
                if (!this._mouseToggled && this._doubleClickEnabled) this.props.changeCurrentBarX(this.pixelPosition + (clientX - this._bar.current!.getBoundingClientRect().left) * this.props.transform.Scale);
                this._mouseToggled = false;
                this._doubleClickEnabled = false;
            }, 200);
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
        const left = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions)!;
        const right = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions)!;
        const prevX = this.regiondata.position;
        const futureX = this.regiondata.position + KeyframeFunc.convertPixelTime(e.movementX, "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        if (futureX <= 0) {
            this.regiondata.position = 0;
        } else if ((left && left.position + left.duration >= futureX)) {
            this.regiondata.position = left.position + left.duration;
        } else if ((right && right.position <= futureX + this.regiondata.duration)) {
            this.regiondata.position = right.position - this.regiondata.duration;
        } else {
            this.regiondata.position = futureX;
        }
        const movement = this.regiondata.position - prevX;
        this.keyframes.forEach(kf => kf.time = NumCast(kf.time) + movement);
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
        const bar = this._bar.current!;
        const offset = KeyframeFunc.convertPixelTime(Math.round((e.clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        const leftRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.left, this.regiondata, this.regions);
        if (leftRegion && this.regiondata.position + offset <= leftRegion.position + leftRegion.duration) {
            this.regiondata.position = leftRegion.position + leftRegion.duration;
            this.regiondata.duration = NumCast(this.keyframes[this.keyframes.length - 1].time) - (leftRegion.position + leftRegion.duration);
        } else if (NumCast(this.keyframes[1].time) + offset >= NumCast(this.keyframes[2].time)) {
            this.regiondata.position = NumCast(this.keyframes[2].time) - this.regiondata.fadeIn;
            this.regiondata.duration = NumCast(this.keyframes[this.keyframes.length - 1].time) - NumCast(this.keyframes[2].time) + this.regiondata.fadeIn;
        } else if (NumCast(this.keyframes[0].time) + offset <= 0) {
            this.regiondata.position = 0;
            this.regiondata.duration = NumCast(this.keyframes[this.keyframes.length - 1].time);
        } else {
            this.regiondata.duration -= offset;
            this.regiondata.position += offset;
        }
        this.keyframes[0].time = this.regiondata.position;
        this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn;
    }


    @action
    onDragResizeRight = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const bar = this._bar.current!;
        const offset = KeyframeFunc.convertPixelTime(Math.round((e.clientX - bar.getBoundingClientRect().right) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        const rightRegion = KeyframeFunc.findAdjacentRegion(KeyframeFunc.Direction.right, this.regiondata, this.regions);
        const fadeOutKeyframeTime = NumCast(this.keyframes[this.keyframes.length - 3].time);
        if (this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut + offset <= fadeOutKeyframeTime) { //case 1: when third to last keyframe is in the way 
            this.regiondata.duration = fadeOutKeyframeTime - this.regiondata.position + this.regiondata.fadeOut;
        } else if (rightRegion && (this.regiondata.position + this.regiondata.duration + offset >= rightRegion.position)) {
            this.regiondata.duration = rightRegion.position - this.regiondata.position;
        } else {
            this.regiondata.duration += offset;
        }
        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut;
        this.keyframes[this.keyframes.length - 1].time = this.regiondata.position + this.regiondata.duration;
    }


    @action
    createKeyframe = async (clientX: number) => {
        this._mouseToggled = true;
        const bar = this._bar.current!;
        const offset = KeyframeFunc.convertPixelTime(Math.round((clientX - bar.getBoundingClientRect().left) * this.props.transform.Scale), "mili", "time", this.props.tickSpacing, this.props.tickIncrement);
        if (offset > this.regiondata.fadeIn && offset < this.regiondata.duration - this.regiondata.fadeOut) { //make sure keyframe is not created inbetween fades and ends
            const position = this.regiondata.position;
            this.props.makeKeyData(this.regiondata, Math.round(position + offset), KeyframeFunc.KeyframeType.default);
            this.regiondata.hasData = true;
            this.props.changeCurrentBarX(KeyframeFunc.convertPixelTime(Math.round(position + offset), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement)); //first move the keyframe to the correct location and make a copy so the correct file gets coppied

        }
    }


    @action
    moveKeyframe = async (e: React.MouseEvent, kf: Doc) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.changeCurrentBarX(KeyframeFunc.convertPixelTime(NumCast(kf.time!), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement));
    }

    /**
     * custom keyframe context menu items (when clicking on the keyframe circle)
     */
    @action
    makeKeyframeMenu = (kf: Doc, e: MouseEvent) => {
        TimelineMenu.Instance.addItem("button", "Toggle Fade Only", () => {
            kf.type = kf.type === KeyframeFunc.KeyframeType.fade ? KeyframeFunc.KeyframeType.default : KeyframeFunc.KeyframeType.fade;
        }),
            TimelineMenu.Instance.addItem("button", "Show Data", action(() => {
                const kvp = Docs.Create.KVPDocument(kf, { _width: 300, _height: 300 });
                CollectionDockingView.AddRightSplit(kvp, emptyPath);
            })),
            TimelineMenu.Instance.addItem("button", "Delete", action(() => {
                (this.regiondata.keyframes as List<Doc>).splice(this.keyframes.indexOf(kf), 1);
                this.forceUpdate();
            })),
            TimelineMenu.Instance.addItem("input", "Move", action((val) => {
                let cannotMove: boolean = false;
                const kfIndex: number = this.keyframes.indexOf(kf);
                if (val < 0 || (val < NumCast(this.keyframes[kfIndex - 1].time) || val > NumCast(this.keyframes[kfIndex + 1].time))) {
                    cannotMove = true;
                }
                if (!cannotMove) {
                    this.keyframes[kfIndex].time = parseInt(val, 10);
                    this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn;
                }
            }));
        TimelineMenu.Instance.addMenu("Keyframe");
        TimelineMenu.Instance.openMenu(e.clientX, e.clientY);
    }

    /**
     * context menu for region (anywhere on the green region). 
     */
    @action
    makeRegionMenu = (kf: Doc, e: MouseEvent) => {
        TimelineMenu.Instance.addItem("button", "Remove Region", () =>
            Cast(this.props.node.regions, listSpec(Doc))?.splice(this.regions.indexOf(this.props.RegionData), 1)),
            TimelineMenu.Instance.addItem("input", `fadeIn: ${this.regiondata.fadeIn}ms`, (val) => {
                runInAction(() => {
                    let cannotMove: boolean = false;
                    if (val < 0 || val > NumCast(this.keyframes[2].time) - this.regiondata.position) {
                        cannotMove = true;
                    }
                    if (!cannotMove) {
                        this.regiondata.fadeIn = parseInt(val, 10);
                        this.keyframes[1].time = this.regiondata.position + this.regiondata.fadeIn;
                    }
                });
            }),
            TimelineMenu.Instance.addItem("input", `fadeOut: ${this.regiondata.fadeOut}ms`, (val) => {
                runInAction(() => {
                    let cannotMove: boolean = false;
                    if (val < 0 || val > this.regiondata.position + this.regiondata.duration - NumCast(this.keyframes[this.keyframes.length - 3].time)) {
                        cannotMove = true;
                    }
                    if (!cannotMove) {
                        this.regiondata.fadeOut = parseInt(val, 10);
                        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - val;
                    }
                });
            }),
            TimelineMenu.Instance.addItem("input", `position: ${this.regiondata.position}ms`, (val) => {
                runInAction(() => {
                    const prevPosition = this.regiondata.position;
                    let cannotMove: boolean = false;
                    this.regions.map(region => ({ pos: NumCast(region.position), dur: NumCast(region.duration) })).forEach(({ pos, dur }) => {
                        if (pos !== this.regiondata.position) {
                            if ((val < 0) || (val > pos && val < pos + dur || (this.regiondata.duration + val > pos && this.regiondata.duration + val < pos + dur))) {
                                cannotMove = true;
                            }
                        }
                    });
                    if (!cannotMove) {
                        this.regiondata.position = parseInt(val, 10);
                        this.updateKeyframes(this.regiondata.position - prevPosition);
                    }
                });
            }),
            TimelineMenu.Instance.addItem("input", `duration: ${this.regiondata.duration}ms`, (val) => {
                runInAction(() => {
                    let cannotMove: boolean = false;
                    this.regions.map(region => ({ pos: NumCast(region.position), dur: NumCast(region.duration) })).forEach(({ pos, dur }) => {
                        if (pos !== this.regiondata.position) {
                            val += this.regiondata.position;
                            if ((val < 0) || (val > pos && val < pos + dur)) {
                                cannotMove = true;
                            }
                        }
                    });
                    if (!cannotMove) {
                        this.regiondata.duration = parseInt(val, 10);
                        this.keyframes[this.keyframes.length - 1].time = this.regiondata.position + this.regiondata.duration;
                        this.keyframes[this.keyframes.length - 2].time = this.regiondata.position + this.regiondata.duration - this.regiondata.fadeOut;
                    }
                });
            }),
            TimelineMenu.Instance.addMenu("Region");
        TimelineMenu.Instance.openMenu(e.clientX, e.clientY);
    }

    @action
    updateKeyframes = (incr: number, filter: number[] = []) => {
        this.keyframes.forEach(kf => {
            if (!filter.includes(this.keyframes.indexOf(kf))) {
                kf.time = NumCast(kf.time) + incr;
            }
        });
    }

    /**
     * hovering effect when hovered (hidden div darkens)
     */
    @action
    onContainerOver = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const div = ref.current!;
        div.style.opacity = "1";
        Doc.BrushDoc(this.props.node);
    }

    /**
     * hovering effect when hovered out (hidden div becomes invisible)
     */
    @action
    onContainerOut = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const div = ref.current!;
        div.style.opacity = "0";
        Doc.UnBrushDoc(this.props.node);
    }


    ///////////////////////UI STUFF /////////////////////////


    /**
     * drawing keyframe. Handles both keyframe with a circle (one that you create by double clicking) and one without circle (fades)
     * this probably needs biggest change, since everyone expected all keyframes to have a circle (and draggable)
     */
    drawKeyframes = () => {
        const keyframeDivs: JSX.Element[] = [];
        return DocListCast(this.regiondata.keyframes).map(kf => {
            if (kf.type as KeyframeFunc.KeyframeType !== KeyframeFunc.KeyframeType.end) {
                return <>
                    <div className="keyframe" style={{ left: `${KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement) - this.pixelPosition}px` }}>
                        <div className="divider"></div>
                        <div className="keyframeCircle keyframe-indicator"
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); this.moveKeyframe(e, kf); }}
                            onContextMenu={(e: React.MouseEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                this.makeKeyframeMenu(kf, e.nativeEvent);
                            }}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        </div>
                    </div>
                    <div className="keyframe-information" />
                </>;
            } else {
                return <div className="keyframe" style={{ left: `${KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement) - this.pixelPosition}px` }}>
                    <div className="divider" />
                </div>;
            }
        });
    }

    /**
     * drawing the hidden divs that partition different intervals within a region. 
     */
    @action
    drawKeyframeDividers = () => {
        const keyframeDividers: JSX.Element[] = [];
        DocListCast(this.regiondata.keyframes).forEach(kf => {
            const index = this.keyframes.indexOf(kf);
            if (index !== this.keyframes.length - 1) {
                const right = this.keyframes[index + 1];
                const bodyRef = React.createRef<HTMLDivElement>();
                const kfPos = KeyframeFunc.convertPixelTime(NumCast(kf.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement);
                const rightPos = KeyframeFunc.convertPixelTime(NumCast(right.time), "mili", "pixel", this.props.tickSpacing, this.props.tickIncrement);
                keyframeDividers.push(
                    <div ref={bodyRef} className="body-container" style={{ left: `${kfPos - this.pixelPosition}px`, width: `${rightPos - kfPos}px` }}
                        onPointerOver={(e) => { e.preventDefault(); e.stopPropagation(); this.onContainerOver(e, bodyRef); }}
                        onPointerOut={(e) => { e.preventDefault(); e.stopPropagation(); this.onContainerOut(e, bodyRef); }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (index !== 0 || index !== this.keyframes.length - 2) {
                                this._mouseToggled = true;
                            }
                            this.makeRegionMenu(kf, e.nativeEvent);
                        }}>
                    </div>
                );
            }
        });
        return keyframeDividers;
    }

    /**
     * rendering that green region
     */
    //154, 206, 223
    render() {
        return (
            <div className="bar" ref={this._bar} style={{
                transform: `translate(${this.pixelPosition}px)`,
                width: `${this.pixelDuration}px`,
                background: `linear-gradient(90deg, rgba(154, 206, 223, 0) 0%, rgba(154, 206, 223, 1) ${this.pixelFadeIn / this.pixelDuration * 100}%, rgba(154, 206, 223, 1) ${(this.pixelDuration - this.pixelFadeOut) / this.pixelDuration * 100}%, rgba(154, 206, 223, 0) 100% )`
            }}
                onPointerDown={this.onBarPointerDown}>
                <div className="leftResize keyframe-indicator" onPointerDown={this.onResizeLeft} ></div>
                {/* <div className="keyframe-information"></div> */}
                <div className="rightResize keyframe-indicator" onPointerDown={this.onResizeRight}></div>
                {/* <div className="keyframe-information"></div> */}
                {this.drawKeyframes()}
                {this.drawKeyframeDividers()}
            </div>
        );
    }
}
import { observable, action, runInAction } from "mobx";
import React = require("react");
import "./CollectionTimelineViewBottomUI.scss";
import "./CollectionTimelineViewBottomUI.scss";
import { Doc } from "../../../new_fields/Doc";

type Node = {
    doc: Doc;
    leftval: number;
    top: number;
    mapleft: number;
};


export class BottomUI extends React.Component<BottomUIProps> {

    @action
    onPointerDown_OnBar = (e: React.PointerEvent): void => {
        this.props.setdownbool(false);
        document.body.style.cursor = "grabbing";
        document.addEventListener("pointermove", this.onPointerMove_OnBar);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerMove_OnBar = (e: PointerEvent): void => {
        e.stopPropagation();
        let newx2 = this.props.rightbound - e.movementX;
        let newx = this.props.leftbound + e.movementX;
        if (newx2 < 0) {
            this.props.rightboundSet(0);
        }
        else if (newx < 0) {
            this.props.leftboundSet(0);
            this.props.rightboundSet(newx2 + e.movementX);
        }
        else {
            this.props.leftboundSet(this.props.leftbound + e.movementX);
            this.props.rightboundSet(this.props.rightbound - e.movementX);
        }
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerUp = (e: PointerEvent): void => {

        document.removeEventListener("pointermove", this.onPointerMove_LeftBound);
        document.removeEventListener("pointermove", this.onPointerMove_RightBound);
        document.removeEventListener("pointermove", this.onPointerMove_OnBar);
        this.props.setdownbool(true);
        document.body.style.cursor = "default";
    }

    @action
    onPointerMove_LeftBound = (e: PointerEvent): void => {
        e.stopPropagation();
        if (this.props.leftbound + e.movementX < 0) {
            this.props.leftboundSet(0);
        }
        else if (this.props.leftbound + e.movementX + 20 > this.props.barwidth - this.props.rightbound) {
            this.props.leftboundSet(this.props.barwidth - this.props.rightbound - 20);
        }
        else {
            this.props.leftboundSet(this.props.leftbound + e.movementX);
        }
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerMove_RightBound = (e: PointerEvent): void => {
        e.stopPropagation();
        if (this.props.rightbound - e.movementX < 0) {
            this.props.rightboundSet(0);
        }
        else if (this.props.rightbound + this.props.leftbound - e.movementX + 20 > this.props.barwidth) {
            this.props.rightboundSet(this.props.barwidth - this.props.leftbound - 20);
        }
        else { this.props.rightboundSet(this.props.rightbound - e.movementX); }

        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerDown_LeftBound = (e: React.PointerEvent): void => {


        document.addEventListener("pointermove", this.onPointerMove_LeftBound);
        e.stopPropagation();
        this.props.setdownbool(false);
    }

    @action
    onPointerDown2_RightBound = (e: React.PointerEvent): void => {


        document.addEventListener("pointermove", this.onPointerMove_RightBound);
        e.stopPropagation();
        this.props.setdownbool(false);
    }

    @action
    onPointerDown_OffBar = (e: React.PointerEvent): void => {
        this.props.setdownbool(false);

        let temp = this.props.barwidth - this.props.rightbound - this.props.leftbound;
        let newx = e.pageX - document.body.clientWidth + this.props.screenref.current!.clientWidth / 0.98;
        this.props.leftboundSet(newx);
        if (this.props.leftbound < 0) {
            this.props.leftboundSet(0);
            newx = 0;
        }

        let newx2 = this.props.barwidth - temp - newx;
        this.props.rightboundSet(newx2);
        if (newx2 < 0) {
            this.props.leftboundSet(newx + newx2);
            this.props.rightboundSet(0);
        }
        e.stopPropagation();
    }

    private borderref = React.createRef<HTMLInputElement>();

    toggleborder() {
        if (this.borderref.current) {
            if (this.props.thumbnailmap.length > 0) {
                this.borderref.current!.style.border = "green 2px solid";
            }
            else {
                this.borderref.current!.style.border = "red 2px solid";
            }
        }
    }

    render() {
        this.toggleborder();
        return (
            <div>
                <div ref={this.props.barref} className="backdropscroll" onPointerDown={this.onPointerDown_OffBar} style={{ zIndex: 99, height: "50px", top: "0px", width: "100%", bottom: "90%", position: "fixed", }}>
                    {this.props.thumbnailmap.map(item => <div
                        style={{
                            position: "absolute",
                            background: "black",
                            zIndex: 90,
                            top: "25%", left: item.mapleft + "px", width: "5px", border: "3px solid"
                        }}>
                    </div>)}
                    {this.props.markermap}
                    <div className="v1" onPointerDown={this.onPointerDown_LeftBound} style={{ cursor: "ew-resize", position: "absolute", zIndex: 100, left: this.props.leftbound, height: "100%" }}></div>
                    <div className="v2" onPointerDown={this.onPointerDown2_RightBound} style={{ cursor: "ew-resize", position: "absolute", right: this.props.rightbound, height: "100%", zIndex: 100 }}></div>
                    <div className="bar" onPointerDown={this.onPointerDown_OnBar} style={{ zIndex: 2, left: this.props.leftbound, width: this.props.barwidth - this.props.rightbound - this.props.leftbound, height: "100%", position: "absolute" }}>
                    </div>
                </div>
            </div>
        );
    }
}

export interface BottomUIProps {
    thumbnailmap: Node[];
    markermap: JSX.Element[];
    leftbound: number;
    rightbound: number;
    leftboundSet: (number: number) => void;
    rightboundSet: (number: number) => void;
    _range: number;
    barwidth: number;
    minvalue: number;
    barref: React.RefObject<HTMLDivElement>;
    screenref: React.RefObject<HTMLDivElement>;
    markerrender: () => void;
    setdownbool: (boolean: boolean) => void;
}
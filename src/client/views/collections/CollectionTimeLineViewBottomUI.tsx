import { observable, action, runInAction } from "mobx";
import React = require("react");
import "./CollectionTimelineViewBottomUI.scss";



export class BottomUI extends React.Component<BottomUIProps> {
    @observable searchString: string | undefined;
    @observable searchString2: string | undefined;
    @observable searchString3: string | undefined;


    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    }

    @action.bound
    onChange2(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString2 = e.target.value;
    }

    @action.bound
    onChange3(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString3 = e.target.value;
    }



    @action.bound
    enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString!) - this.props.minvalue) * this.props.barwidth / this.props._range;
            if (!isNaN(thing)) {
                if (thing > this.props.barwidth) {
                    this.props.rightboundSet(0);
                }
                else if
                    (this.props.leftbound + thing >= this.props.barwidth) {
                    this.props.rightboundSet(this.props.barwidth - this.props.leftbound - 1);
                }
                else {
                    this.props.rightboundSet(this.props.barwidth - thing);
                }


            }

            this.searchref.current ? this.searchref.current.reset() : null;
            this.searchString = undefined;
            this.searchString2 = undefined;
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action.bound
    enter2 = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString2!) - this.props.minvalue) * this.props.barwidth / this.props._range;
            if (!isNaN(thing)) {
                if (thing < 0) {
                    this.props.leftboundSet(0);
                }
                else if (thing >= this.props.barwidth - this.props.rightbound) {
                    this.props.leftboundSet(this.props.barwidth - this.props.rightbound - 1);
                }
                else {
                    this.props.leftboundSet(thing);
                }
            }
            this.searchString2 = undefined;
            this.searchString = undefined;
            this.searchref.current!.reset();
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action
    enter3 = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString2!) - this.props.minvalue) * this.props.barwidth / this.props._range;
            if (!isNaN(thing)) {
                if (thing < 0) {
                    this.props.leftboundSet(0);
                }
                else if (thing >= this.props.barwidth - this.props.rightbound) {
                    this.props.leftboundSet(this.props.barwidth - this.props.rightbound - 1);
                }
                else {
                    this.props.leftboundSet(thing);
                }
            }
            this.props.setsortstate(this.searchString3!);
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action
    toggleColor = (e: React.MouseEvent<HTMLDivElement>, color: string) => {
        this.props.selectedColorSet(color);
        if (color === "#ffff80") {
            this.colorrefYellow.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#bfff80") {
            this.colorrefGreen.current!.style.border = "2px solid black";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#ff8080") {
            this.colorrefRed.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#80dfff") {
            this.colorrefBlue.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
        }
    }


    private colorrefYellow = React.createRef<HTMLDivElement>();
    private colorrefGreen = React.createRef<HTMLDivElement>();
    private colorrefRed = React.createRef<HTMLDivElement>();
    private colorrefBlue = React.createRef<HTMLDivElement>();
    private searchref = React.createRef<HTMLFormElement>();
    private searchref2 = React.createRef<HTMLFormElement>();

    @action
    onPointerDown_OnBar = (e: React.PointerEvent): void => {
        document.body.style.cursor = "grabbing";
        document.addEventListener("pointermove", this.onPointerMove_OnBar);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerMove_OnBar = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
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
        document.body.style.cursor = "default";
    }

    @action
    onPointerMove_LeftBound = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
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
        e.preventDefault();
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
        e.preventDefault();
    }

    @action
    onPointerDown2_RightBound = (e: React.PointerEvent): void => {
        document.addEventListener("pointermove", this.onPointerMove_RightBound);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    onPointerDown_OffBar = (e: React.PointerEvent): void => {
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
        e.preventDefault();
    }

    private borderref = React.createRef<HTMLInputElement>();

    toggleborder() {
        if (this.borderref.current) {
            if (this.props.truesort === "sortinputRIGHT") {
                this.borderref.current!.style.border = "green 2px solid";
            }
            if (this.props.truesort === "sortinputWRONG") {
                this.borderref.current!.style.border = "red 2px solid";
            }
        }
    }

    render() {
        this.toggleborder();
        return (
            <div>
                <div className="collectionTimelineViewBottomUI-grid">
                    <form className="form" ref={this.searchref}>
                        <div className="min">
                            <input size={10} value={this.searchString2} onChange={this.onChange2} onKeyPress={this.enter2} type="text" placeholder={"Min: " + String(Math.round((this.props.leftbound * this.props._range / this.props.barwidth) + this.props.minvalue))}
                                className="searchBox-barChild searchBox-input" />
                        </div>

                        <div className="max">
                            <input size={10} value={this.searchString ? this.searchString : undefined} onChange={this.onChange} onFocus={() => this.searchString = ""} onKeyPress={this.enter} type="text" placeholder={"Max: " + String(Math.round(((this.props.barwidth - this.props.rightbound) * this.props._range / this.props.barwidth) + this.props.minvalue))}
                                className="searchBox-barChild searchBox-input" />
                        </div>

                    </form>
                    <div className="reset"> <button onClick={() => runInAction(() => { this.props.leftboundSet(0); this.props.rightboundSet(0); (this.searchref.current ? this.searchref.current.reset() : null); })}>Reset Range</button></div>
                    <div ref={this.colorrefYellow} onClick={(e) => this.toggleColor(e, "#ffff80")} className="color1" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ffff80", border: "2px solid black" }}></div>
                    <div ref={this.colorrefGreen} onClick={(e) => this.toggleColor(e, "#bfff80")} className="color2" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#bfff80", border: "2px solid #9c9396" }}></div>
                    <div ref={this.colorrefRed} onClick={(e) => this.toggleColor(e, "#ff8080")} className="color3" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ff8080", border: "2px solid #9c9396" }}></div>
                    <div ref={this.colorrefBlue} onClick={(e) => this.toggleColor(e, "#80dfff")} className="color4" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#80dfff", border: "2px solid #9c9396" }}></div>
                    <input height={"20px"} ref={this.borderref} type="text" value={this.searchString3 ? this.searchString : undefined} placeholder={"sort value: " + this.props.sortstate} onChange={this.onChange3} onKeyPress={this.enter3} />
                </div>
                <div ref={this.props.barref} className="backdropscroll" onPointerDown={this.onPointerDown_OffBar} style={{ zIndex: 1, top: "50px", height: "30px", width: "100%", bottom: "90%", position: "fixed", }}>
                    {/*{this.props.thumbnailmap}*/}
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
    //thumbnailmap: JSX.Element[];
    markermap: JSX.Element[];
    leftbound: number;
    rightbound: number;
    leftboundSet: (number: number) => void;
    rightboundSet: (number: number) => void;
    _range: number;
    barwidth: number;
    minvalue: number;
    sortstate: string;
    setsortstate: (string: string) => void;
    selectedColor: string;
    selectedColorSet: (color: string) => void;
    barref: React.RefObject<HTMLDivElement>;
    barwidthSet: (number: number) => void;
    screenref: React.RefObject<HTMLDivElement>;
    markerrender: () => void;
    truesort: string;
}
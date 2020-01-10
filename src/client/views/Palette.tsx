import * as React from "react";
import "./Palette.scss";
import { PointData } from "../../new_fields/InkField";

export interface PaletteProps {
    x: number;
    y: number;
    thumb: number[];
}

export default class Palette extends React.Component<PaletteProps> {
    render() {
        return (
            <div className="palette-container" style={{ transform: `translate(${this.props.x}px, ${this.props.y}px)` }}>
                <div className="palette-thumb" style={{ transform: `translate(${this.props.thumb[0] - this.props.x}px, ${this.props.thumb[1] - this.props.y}px)` }}>
                    <div className="palette-thumbContent">
                        <div className="palette-button" style={{ background: "green" }} onPointerDown={() => console.log("hi")}>1</div>
                        <div className="palette-button" style={{ background: "red" }}>2</div>
                        <div className="palette-button" style={{ background: "blue" }}>3</div>
                    </div>
                </div>
            </div>
        );
    }
}
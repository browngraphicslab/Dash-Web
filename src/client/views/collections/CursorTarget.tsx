import React = require("react");
import { CursorEntry } from "./CollectionViewBase";
import v5 = require("uuid/v5");
import { observer } from "mobx-react";

export interface RemoteCursorsProps {
    radius: number;
    opacity: number;
    remoteCursors: () => CursorEntry[];
}

@observer
export default class RemoteCursors extends React.Component<RemoteCursorsProps> {
    render() {
        return (
            this.props.remoteCursors().map(entry => {
                if (entry.Data.length > 0) {
                    let point = entry.Data[1]
                    let offset = this.props.radius / 2;
                    return (
                        <div
                            key={entry.Data[0][0]}
                            style={{
                                position: "absolute",
                                transform: `translate(${point[0] - offset}px, ${point[1] - offset}px)`,
                                zIndex: 10000,
                                transformOrigin: 'center center',
                            }}
                        >
                            <CursorTarget
                                email={entry.Data[0][1]}
                                opacity={this.props.opacity}
                                radius={this.props.radius}
                            />
                        </div>
                    );
                }
            })
        );
    }
}

export interface CursorTargetProps {
    opacity: number;
    radius: number;
    email: string;
}

@observer
export class CursorTarget extends React.Component<CursorTargetProps> {

    getDeterministicBackground = () => {
        return "#" + v5(this.props.email, v5.URL).substring(0, 6).toUpperCase();
    }

    renderTarget = (canvas: HTMLCanvasElement | null, backgroundColor: string) => {
        let rad = this.props.radius;
        let ctx;
        if (canvas && (ctx = canvas.getContext('2d'))) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, rad, rad);

            ctx.fillStyle = "black";
            ctx.lineWidth = 0.5;

            let half = rad / 2;
            // how far do the crosshairs extend in?
            // 0.5 = meet in the middle
            let fraction = rad * 0.4

            ctx.beginPath();

            ctx.moveTo(half, 0);
            ctx.lineTo(half, fraction);

            ctx.moveTo(half, rad);
            ctx.lineTo(half, rad - fraction);

            ctx.moveTo(0, half);
            ctx.lineTo(fraction, half);

            ctx.moveTo(rad, half);
            ctx.lineTo(rad - fraction, half);

            ctx.stroke();
        }
    }

    render() {
        let rad = this.props.radius;
        return (
            <div>
                <canvas
                    ref={(canvas) => { this.renderTarget(canvas, this.getDeterministicBackground()) }}
                    width={rad}
                    height={rad}
                    style={{
                        position: 'absolute',
                        width: rad,
                        height: rad,
                        opacity: this.props.opacity,
                        borderRadius: "50%",
                        border: "2px solid black"
                    }}
                />
                <p
                    style={{
                        position: 'absolute',
                        fontSize: 14,
                        color: "black",
                        marginLeft: -12,
                        marginTop: 4
                    }}
                >{this.props.email[0].toUpperCase()}</p>
            </div>
        );
    }

}
import React = require("react");
import { CursorEntry } from "../CollectionViewBase";
import v5 = require("uuid/v5");
import { observer } from "mobx-react";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import { CollectionViewProps } from "../CollectionViewBase";
import { KeyStore } from "../../../../fields/KeyStore";
import './CursorTarget.scss'

export interface RemoteCursorsProps extends CollectionViewProps {
    radius: number;
    opacity: number;
}

@observer
export class RemoteCursors extends React.Component<RemoteCursorsProps> {
    protected getCursors(): CursorEntry[] {
        let doc = this.props.Document;
        let id = CurrentUserUtils.id;
        let cursors = doc.GetList<CursorEntry>(KeyStore.Cursors, []);
        let notMe = cursors.filter(entry => entry.Data[0][0] !== id);
        return id ? notMe : [];
    }
    render() {
        return (
            this.getCursors().filter(entry => entry.Data.length > 0).map(entry =>
                <div className="remoteCursor" key={entry.Data[0][0]}
                    style={{ transform: `translate(${entry.Data[1][0] - this.props.radius / 2}px, ${entry.Data[1][1] - this.props.radius / 2}px)` }}>
                    <CursorTarget
                        email={entry.Data[0][1]}
                        opacity={this.props.opacity}
                        radius={this.props.radius} />
                </div>
            )
        );
    }
}

interface CursorTargetProps {
    opacity: number;
    radius: number;
    email: string;
}

@observer
class CursorTarget extends React.Component<CursorTargetProps> {

    getDeterministicBackground = () => {
        return "#" + v5(this.props.email, v5.URL).substring(0, 6).toUpperCase();
    }

    renderTarget = (canvas: HTMLCanvasElement | null, backgroundColor: string, rad: number) => {
        let ctx = canvas ? canvas.getContext('2d') : undefined;
        if (ctx) {
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
        return (<div className="cursorTarget">
            <canvas className="cursorTarget-canvas"
                ref={canvas => this.renderTarget(canvas, this.getDeterministicBackground(), this.props.radius)}
                width={this.props.radius}
                height={this.props.radius}
                style={{
                    width: this.props.radius,
                    height: this.props.radius,
                    opacity: this.props.opacity,
                }}
            />
            <p className="cursorTarget-p">
                {this.props.email[0].toUpperCase()}
            </p>
        </div>);
    }

}
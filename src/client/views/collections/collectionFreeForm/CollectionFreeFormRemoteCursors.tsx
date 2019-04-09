import { computed } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../../fields/KeyStore";
import { CollectionViewProps, CursorEntry } from "../CollectionSubView";
import "./CollectionFreeFormView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";

@observer
export class CollectionFreeFormRemoteCursors extends React.Component<CollectionViewProps> {
    protected getCursors(): CursorEntry[] {
        let doc = this.props.Document;
        let id = CurrentUserUtils.id;
        let cursors = doc.GetList<CursorEntry>(KeyStore.Cursors, []);
        let notMe = cursors.filter(entry => entry.Data[0][0] !== id);
        return id ? notMe : [];
    }

    private crosshairs?: HTMLCanvasElement;
    drawCrosshairs = (backgroundColor: string) => {
        if (this.crosshairs) {
            let c = this.crosshairs;
            let ctx = c.getContext('2d');
            if (ctx) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, 20, 20);

                ctx.fillStyle = "black";
                ctx.lineWidth = 0.5;

                ctx.beginPath();

                ctx.moveTo(10, 0);
                ctx.lineTo(10, 8);

                ctx.moveTo(10, 20);
                ctx.lineTo(10, 12);

                ctx.moveTo(0, 10);
                ctx.lineTo(8, 10);

                ctx.moveTo(20, 10);
                ctx.lineTo(12, 10);

                ctx.stroke();

                // ctx.font = "10px Arial";
                // ctx.fillText(CurrentUserUtils.email[0].toUpperCase(), 10, 10);
            }
        }
    }
    @computed
    get sharedCursors() {
        return this.getCursors().map(entry => {
            if (entry.Data.length > 0) {
                let id = entry.Data[0][0];
                let email = entry.Data[0][1];
                let point = entry.Data[1];
                this.drawCrosshairs("#" + v5(id, v5.URL).substring(0, 6).toUpperCase() + "22");
                return (
                    <div
                        key={id}
                        style={{
                            position: "absolute",
                            transform: `translate(${point[0] - 10}px, ${point[1] - 10}px)`,
                            zIndex: 10000,
                            transformOrigin: 'center center',
                        }}
                    >
                        <canvas
                            ref={(el) => { if (el) this.crosshairs = el; }}
                            width={20}
                            height={20}
                            style={{
                                position: 'absolute',
                                width: "20px",
                                height: "20px",
                                opacity: 0.5,
                                borderRadius: "50%",
                                border: "2px solid black"
                            }}
                        />
                        <p
                            style={{
                                fontSize: 14,
                                color: "black",
                                // fontStyle: "italic",
                                marginLeft: -12,
                                marginTop: 4
                            }}
                        >{email[0].toUpperCase()}</p>
                    </div>
                );
            }
        });
    }

    render() {
        return this.sharedCursors;
    }
}
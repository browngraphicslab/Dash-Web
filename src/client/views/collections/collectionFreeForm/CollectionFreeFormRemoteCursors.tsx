import { computed } from "mobx";
import { observer } from "mobx-react";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import CursorField from "../../../../new_fields/CursorField";
import { List } from "../../../../new_fields/List";
import { Cast } from "../../../../new_fields/Types";
import { listSpec } from "../../../../new_fields/Schema";

@observer
export class CollectionFreeFormRemoteCursors extends React.Component<CollectionViewProps> {

    protected getCursors(): CursorField[] {
        let doc = this.props.Document;

        let id = CurrentUserUtils.id;
        if (!id) {
            return [];
        }

        let cursors = Cast(doc.cursors, listSpec(CursorField));

        return (cursors || []).filter(cursor => cursor.data.metadata.id !== id);
    }

    private crosshairs?: HTMLCanvasElement;
    drawCrosshairs = (backgroundColor: string) => {
        if (this.crosshairs) {
            let ctx = this.crosshairs.getContext('2d');
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

    get sharedCursors() {
        return this.getCursors().map(c => {
            let m = c.data.metadata;
            let l = c.data.position;
            this.drawCrosshairs("#" + v5(m.id, v5.URL).substring(0, 6).toUpperCase() + "22");
            return (
                <div key={m.id} className="collectionFreeFormRemoteCursors-cont"
                    style={{ transform: `translate(${l.x - 10}px, ${l.y - 10}px)` }}
                >
                    <canvas className="collectionFreeFormRemoteCursors-canvas"
                        ref={(el) => { if (el) this.crosshairs = el; }}
                        width={20}
                        height={20}
                    />
                    <p className="collectionFreeFormRemoteCursors-symbol">
                        {m.identifier[0].toUpperCase()}
                    </p>
                </div>
            );
        });
    }

    render() {
        return this.sharedCursors;
    }
}
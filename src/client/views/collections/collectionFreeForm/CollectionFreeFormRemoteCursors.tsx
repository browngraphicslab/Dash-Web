import { observer } from "mobx-react";
import * as mobxUtils from 'mobx-utils';
import CursorField from "../../../../new_fields/CursorField";
import { listSpec } from "../../../../new_fields/Schema";
import { Cast } from "../../../../new_fields/Types";
import { CurrentUserUtils } from "../../../util/CurrentUserUtils";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { computed } from "mobx";
import { FieldResult } from "../../../../new_fields/Doc";
import { List } from "../../../../new_fields/List";

@observer
export class CollectionFreeFormRemoteCursors extends React.Component<CollectionViewProps> {

    @computed protected get cursors(): CursorField[] {
        const doc = this.props.Document;

        let cursors: FieldResult<List<CursorField>>;
        const { id } = CurrentUserUtils;
        if (!id || !(cursors = Cast(doc.cursors, listSpec(CursorField)))) {
            return [];
        }
        const now = mobxUtils.now();
        return (cursors || []).filter(({ data: { metadata } }) => metadata.id !== id && (now - metadata.timestamp) < 1000);
    }

    @computed get renderedCursors() {
        return this.cursors.map(({ data: { metadata, position: { x, y } } }) => {
            return (
                <div key={metadata.id} className="collectionFreeFormRemoteCursors-cont"
                    style={{ transform: `translate(${x - 10}px, ${y - 10}px)` }}
                >
                    <canvas className="collectionFreeFormRemoteCursors-canvas"
                        ref={(el) => {
                            if (el) {
                                const ctx = el.getContext('2d');
                                if (ctx) {
                                    ctx.fillStyle = "#" + v5(metadata.id, v5.URL).substring(0, 6).toUpperCase() + "22";
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
                                }
                            }
                        }}
                        width={20}
                        height={20}
                    />
                    <p className="collectionFreeFormRemoteCursors-symbol">
                        {metadata.identifier[0].toUpperCase()}
                    </p>
                </div>
            );
        });
    }

    render() {
        return this.renderedCursors;
    }
}
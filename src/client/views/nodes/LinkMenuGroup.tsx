import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentView } from "./DocumentView";
import { LinkMenuItem } from "./LinkMenuItem";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { LinkManager } from "../../util/LinkManager";
import { DragLinksAsDocuments, DragManager } from "../../util/DragManager";
import { emptyFunction } from "../../../Utils";

interface LinkMenuGroupProps {
    sourceDoc: Doc;
    group: Doc[];
    groupType: string;
    showEditor: (linkDoc: Doc) => void;
}

@observer
export class LinkMenuGroup extends React.Component<LinkMenuGroupProps> {

    private _drag = React.createRef<HTMLDivElement>();

    onLinkButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
    }

    onLinkButtonMoved = async (e: PointerEvent) => {
        if (this._drag.current !== null && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            let draggedDocs = this.props.group.map(linkDoc => LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc));
            let dragData = new DragManager.DocumentDragData(draggedDocs);

            DragManager.StartLinkedDocumentDrag([this._drag.current], this.props.sourceDoc, dragData, e.x, e.y, {
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    render() {
        let groupItems = this.props.group.map(linkDoc => {
            let destination = LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc);
            return <LinkMenuItem key={destination[Id] + this.props.sourceDoc[Id]} groupType={this.props.groupType}
                linkDoc={linkDoc} sourceDoc={this.props.sourceDoc} destinationDoc={destination} showEditor={this.props.showEditor} />;
        });

        return (
            <div className="linkMenu-group">
                <p className="linkMenu-group-name" ref={this._drag} onPointerDown={this.onLinkButtonDown} >{this.props.groupType}:</p>
                <div className="linkMenu-group-wrapper">
                    {groupItems}
                </div>
            </div>
        );
    }
}
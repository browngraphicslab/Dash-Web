import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { emptyFunction } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { UndoManager } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import './LinkMenu.scss';
import { LinkMenuItem } from "./LinkMenuItem";
import React = require("react");

interface LinkMenuGroupProps {
    sourceDoc: Doc;
    group: Doc[];
    groupType: string;
    showEditor: (linkDoc: Doc) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    docView: DocumentView;

}

@observer
export class LinkMenuGroup extends React.Component<LinkMenuGroupProps> {

    private _drag = React.createRef<HTMLDivElement>();
    private _table = React.createRef<HTMLDivElement>();

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
        UndoManager.RunInBatch(() => {
            if (this._drag.current !== null && (e.movementX > 1 || e.movementY > 1)) {
                document.removeEventListener("pointermove", this.onLinkButtonMoved);
                document.removeEventListener("pointerup", this.onLinkButtonUp);

                let draggedDocs = this.props.group.map(linkDoc => {
                    let opp = LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc);
                    if (opp) return opp;
                }) as Doc[];
                let dragData = new DragManager.DocumentDragData(draggedDocs);

                DragManager.StartLinkedDocumentDrag([this._drag.current], dragData, e.x, e.y, {
                    handlers: {
                        dragComplete: action(emptyFunction),
                    },
                    hideSource: false
                });
            }
        }, "drag links");
        e.stopPropagation();
    }

    viewGroupAsTable = (groupType: string): JSX.Element => {
        let keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        let index = keys.indexOf("");
        if (index > -1) keys.splice(index, 1);
        let cols = ["anchor1", "anchor2", ...[...keys]].map(c => new SchemaHeaderField(c, "#f1efeb"));
        let docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(groupType);
        let createTable = action(() => Docs.Create.SchemaDocument(cols, docs, { width: 500, height: 300, title: groupType + " table" }));
        let ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button linkEditor-tableButton" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    render() {
        let groupItems = this.props.group.map(linkDoc => {
            let destination = LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc);
            if (destination && this.props.sourceDoc) {
                return <LinkMenuItem key={destination[Id] + this.props.sourceDoc[Id]}
                    groupType={this.props.groupType}
                    addDocTab={this.props.addDocTab}
                    linkDoc={linkDoc}
                    sourceDoc={this.props.sourceDoc}
                    destinationDoc={destination}
                    showEditor={this.props.showEditor} />;
            }
        });

        return (
            <div className="linkMenu-group">
                <div className="linkMenu-group-name">
                    <p ref={this._drag} onPointerDown={this.onLinkButtonDown}
                        className={this.props.groupType === "*" || this.props.groupType === "" ? "" : "expand-one"} > {this.props.groupType}:</p>
                    {this.props.groupType === "*" || this.props.groupType === "" ? <></> : this.viewGroupAsTable(this.props.groupType)}
                </div>
                <div className="linkMenu-group-wrapper">
                    {groupItems}
                </div>
            </div >
        );
    }
}
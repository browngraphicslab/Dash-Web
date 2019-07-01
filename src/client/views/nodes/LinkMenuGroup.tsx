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
import { DragManager, SetupDrag } from "../../util/DragManager";
import { emptyFunction } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface LinkMenuGroupProps {
    sourceDoc: Doc;
    group: Doc[];
    groupType: string;
    showEditor: (linkDoc: Doc) => void;
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
        if (this._drag.current !== null && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            let draggedDocs = this.props.group.map(linkDoc => {
                let opp = LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc);
                if (opp) return opp;
            }) as Doc[];
            let dragData = new DragManager.DocumentDragData(draggedDocs, draggedDocs.map(d => undefined));

            DragManager.StartLinkedDocumentDrag([this._drag.current], dragData, e.x, e.y, {
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    deleteGroupType = (): void => {
        LinkManager.Instance.deleteGroupType(this.props.groupType);
    }

    removeGroupFromAnchor = (): void => {
        LinkManager.Instance.removeGroupFromAnchor(this.props.sourceDoc, this.props.groupType);
    }

    viewGroupAsTable = (): JSX.Element => {
        let keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);
        let index = keys.indexOf("");
        if (index > -1) keys.splice(index, 1);
        let cols = ["anchor1", "anchor2", ...[...keys]];
        let docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(this.props.groupType);
        let createTable = action(() => Docs.SchemaDocument(cols, docs, { width: 500, height: 300, title: this.props.groupType + " table" }));
        let ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button linkEditor-tableButton" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    render() {
        let groupItems = this.props.group.map(linkDoc => {
            let destination = LinkManager.Instance.getOppositeAnchor(linkDoc, this.props.sourceDoc);
            if (destination) {
                return <LinkMenuItem key={destination[Id] + this.props.sourceDoc[Id]} groupType={this.props.groupType}
                    linkDoc={linkDoc} sourceDoc={this.props.sourceDoc} destinationDoc={destination} showEditor={this.props.showEditor} />;
            }
        });

        let groupButtons = (
            <div className="linkMenu-group-buttons">
                <button className="linkEditor-button" onClick={() => this.removeGroupFromAnchor()} title="Remove all links in this relationship from this document"><FontAwesomeIcon icon="times" size="sm" /></button>
                {/* <button className="linkEditor-button" onClick={() => this.deleteGroupType()} title="Delete relationship type on all documents"><FontAwesomeIcon icon="trash" size="sm" /></button> */}
                {this.viewGroupAsTable()}
            </div>
        );


        let hasGroupType = !(this.props.groupType === "*" || this.props.groupType === "");

        return (
            <div className="linkMenu-group">
                <div className="linkMenu-group-name">
                    <p ref={this._drag} onPointerDown={this.onLinkButtonDown}
                        className={hasGroupType ? "expand-two" : ""} >
                        {hasGroupType ? this.props.groupType : "All links"}:</p>
                    {hasGroupType ? groupButtons : <></>}
                </div>
                <div className="linkMenu-group-wrapper">
                    {groupItems}
                </div>
            </div >
        );
    }
}
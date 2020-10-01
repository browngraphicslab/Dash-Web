import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { Docs } from "../../documents/Documents";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { DocumentView } from "../nodes/DocumentView";
import './LinkMenu.scss';
import { LinkMenuItem, StartLinkTargetsDrag } from "./LinkMenuItem";
import React = require("react");
import { Cast } from "../../../fields/Types";

interface LinkMenuGroupProps {
    sourceDoc: Doc;
    group: Doc[];
    groupType: string;
    showEditor: (linkDoc: Doc) => void;
    addDocTab: (document: Doc, where: string) => boolean;
    docView: DocumentView;
}

@observer
export class LinkMenuGroup extends React.Component<LinkMenuGroupProps> {

    private _drag = React.createRef<HTMLDivElement>();
    private _table = React.createRef<HTMLDivElement>();
    private _menuRef = React.createRef<HTMLDivElement>();

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
        if (this._drag.current && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            const targets = this.props.group.map(l => LinkManager.getOppositeAnchor(l, this.props.sourceDoc)).filter(d => d) as Doc[];
            StartLinkTargetsDrag(this._drag.current, this.props.docView, e.x, e.y, this.props.sourceDoc, targets);
        }
        e.stopPropagation();
    }

    viewGroupAsTable = (groupType: string): JSX.Element => {
        const keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        const index = keys.indexOf("");
        if (index > -1) keys.splice(index, 1);
        const cols = ["anchor1", "anchor2", ...[...keys]].map(c => new SchemaHeaderField(c, "#f1efeb"));
        const docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(groupType);
        const createTable = action(() => Docs.Create.SchemaDocument(cols, docs, { _width: 500, _height: 300, title: groupType + " table", childDropAction: "alias" }));
        const ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button linkEditor-tableButton" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    render() {
        const set = new Set<Doc>(this.props.group);
        const groupItems = Array.from(set.keys()).map(linkDoc => {
            const destination = LinkManager.getOppositeAnchor(linkDoc, this.props.sourceDoc) ||
                LinkManager.getOppositeAnchor(linkDoc, Cast(linkDoc.anchor2, Doc, null).annotationOn === this.props.sourceDoc ? Cast(linkDoc.anchor2, Doc, null) : Cast(linkDoc.anchor1, Doc, null));
            if (destination && this.props.sourceDoc) {
                return <LinkMenuItem key={linkDoc[Id]}
                    groupType={this.props.groupType}
                    addDocTab={this.props.addDocTab}
                    docView={this.props.docView}
                    linkDoc={linkDoc}
                    sourceDoc={this.props.sourceDoc}
                    destinationDoc={destination}
                    showEditor={this.props.showEditor}
                    menuRef={this._menuRef} />;
            }
        });

        return (
            <div className="linkMenu-group" ref={this._menuRef}>

                {/* <div className="linkMenu-group-name">
                    <p ref={this._drag} onPointerDown={this.onLinkButtonDown}
                        className={this.props.groupType === "*" || this.props.groupType === "" ? "" : "expand-one"} > {this.props.groupType}:</p>
                    {this.props.groupType === "*" || this.props.groupType === "" ? <></> : this.viewGroupAsTable(this.props.groupType)}
                </div> */}

                <div className="linkMenu-group-wrapper">
                    {groupItems}
                </div>
            </div >
        );
    }
}
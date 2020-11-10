import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { Cast } from "../../../fields/Types";
import { LinkManager } from "../../util/LinkManager";
import { DocumentView } from "../nodes/DocumentView";
import './LinkMenu.scss';
import { LinkMenuItem } from "./LinkMenuItem";
import React = require("react");

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
    private _menuRef = React.createRef<HTMLDivElement>();

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

                <div className="linkMenu-group-name">
                    <p ref={this._drag} className={this.props.groupType === "*" || this.props.groupType === "" ? "" : "expand-one"} > {this.props.groupType}:</p>
                </div>

                <div className="linkMenu-group-wrapper">
                    {groupItems}
                </div>
            </div >
        );
    }
}
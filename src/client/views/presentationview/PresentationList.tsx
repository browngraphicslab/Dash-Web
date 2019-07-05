import { observer } from "mobx-react";
import React = require("react");
import { action } from "mobx";
import "./PresentationView.scss";
import { Utils } from "../../../Utils";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import PresentationElement, { buttonIndex } from "./PresentationElement";
import { DragManager } from "../../util/DragManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import "../../../new_fields/Doc";




interface PresListProps {
    mainDocument: Doc;
    deleteDocument(index: number): void;
    gotoDocument(index: number, fromDoc: number): Promise<void>;
    groupMappings: Map<String, Doc[]>;
    setPresElementsMappings: (keyDoc: Doc, elem: PresentationElement) => void;
    setChildrenDocs: (docList: Doc[]) => void;
    presStatus: boolean;
    presButtonBackUp: Doc;
    presGroupBackUp: Doc;
    removeDocByRef(doc: Doc): boolean;

}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
export default class PresentationViewList extends React.Component<PresListProps> {

    /**
     * Method that initializes presentation ids for the
     * docs that is in the presentation, when presentation list
     * gets re-rendered. It makes sure to not assign ids to the
     * docs that are in the group, so that mapping won't be disrupted.
     */

    @action
    initializeGroupIds = async (docList: Doc[]) => {
        docList.forEach(async (doc: Doc, index: number) => {
            let docGuid = StrCast(doc.presentId, null);
            //checking if part of group
            let storedGuids: string[] = [];
            let castedGroupDocs = await DocListCastAsync(this.props.presGroupBackUp.groupDocs);
            //making sure the docs that were in groups, which were stored, to not get new guids.
            if (castedGroupDocs !== undefined) {
                castedGroupDocs.forEach((doc: Doc) => {
                    let storedGuid = StrCast(doc.presentIdStore, null);
                    if (storedGuid) {
                        storedGuids.push(storedGuid);
                    }

                });
            }
            if (!this.props.groupMappings.has(docGuid) && !storedGuids.includes(docGuid)) {
                doc.presentId = Utils.GenerateGuid();
            }
        });
    }

    /**
     * Initially every document starts with a viewScale 1, which means
     * that they will be displayed in a canvas with scale 1.
     */
    @action
    initializeScaleViews = (docList: Doc[]) => {
        docList.forEach((doc: Doc) => {
            let curScale = NumCast(doc.viewScale, null);
            if (curScale === undefined) {
                doc.viewScale = 1;
            }
        });
    }

    render() {
        const children = DocListCast(this.props.mainDocument.data);
        this.initializeGroupIds(children);
        this.initializeScaleViews(children);
        this.props.setChildrenDocs(children);
        return (
            <div className="presentationView-listCont" >
                {children.map((doc: Doc, index: number) =>
                    <PresentationElement
                        ref={(e) => { if (e) { this.props.setPresElementsMappings(doc, e); } }}
                        key={doc[Id]}
                        mainDocument={this.props.mainDocument}
                        document={doc}
                        index={index}
                        deleteDocument={this.props.deleteDocument}
                        gotoDocument={this.props.gotoDocument}
                        groupMappings={this.props.groupMappings}
                        allListElements={children}
                        presStatus={this.props.presStatus}
                        presButtonBackUp={this.props.presButtonBackUp}
                        presGroupBackUp={this.props.presGroupBackUp}
                        removeDocByRef={this.props.removeDocByRef}
                    />
                )}
            </div>
        );
    }
}

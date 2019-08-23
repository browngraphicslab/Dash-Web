import { action } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { NumCast } from "../../../new_fields/Types";
import PresentationElement from "./PresentationElement";
import "./PresentationView.scss";
import React = require("react");


interface PresListProps {
    mainDocument: Doc;
    deleteDocument(index: number): void;
    gotoDocument(index: number, fromDoc: number): Promise<void>;
    PresElementsMappings: Map<Doc, PresentationElement>;
    setChildrenDocs: (docList: Doc[]) => void;
    presStatus: boolean;
    removeDocByRef(doc: Doc): boolean;
    clearElemMap(): void;

}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
export default class PresentationViewList extends React.Component<PresListProps> {


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
        this.initializeScaleViews(children);
        this.props.setChildrenDocs(children);
        this.props.clearElemMap();
        return (
            <div className="presentationView-listCont" >
                {children.map((doc: Doc, index: number) =>
                    <PresentationElement
                        ref={(e) => {
                            if (e && e !== null) {
                                this.props.PresElementsMappings.set(doc, e);
                            }
                        }}
                        key={doc[Id]}
                        mainDocument={this.props.mainDocument}
                        document={doc}
                        index={index}
                        deleteDocument={this.props.deleteDocument}
                        gotoDocument={this.props.gotoDocument}
                        allListElements={children}
                        presStatus={this.props.presStatus}
                        removeDocByRef={this.props.removeDocByRef}
                        PresElementsMappings={this.props.PresElementsMappings}
                    />
                )}
            </div>
        );
    }
}

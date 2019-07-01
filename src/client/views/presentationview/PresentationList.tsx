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
    presElementsMappings: Map<Doc, PresentationElement>;
    setChildrenDocs: (docList: Doc[]) => void;
    presStatus: boolean;
    presButtonBackUp: Doc;
    presGroupBackUp: Doc;
}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
export default class PresentationViewList extends React.Component<PresListProps> {

    private listdropDisposer?: DragManager.DragDropDisposer;
    private header?: React.RefObject<HTMLDivElement> = React.createRef();
    private listContainer: HTMLDivElement | undefined;


    componentWillUnmount() {
        this.listdropDisposer && this.listdropDisposer();
    }



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

    protected createListDropTarget = (ele: HTMLDivElement) => {
        this.listdropDisposer && this.listdropDisposer();
        if (ele) {
            this.listdropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.listDrop.bind(this) } });
        }
    }

    listDrop = (e: Event, de: DragManager.DropEvent) => {
        let x = this.ScreenToLocalListTransform(de.x, de.y);
        let rect = this.header!.current!.getBoundingClientRect();
        let bounds = this.ScreenToLocalListTransform(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        if (de.data instanceof DragManager.DocumentDragData) {
            let addDoc = (doc: Doc) => doc.AddDocToList(doc, "data", this.resolvedDataDoc, before);
            e.stopPropagation();
            //where does treeViewId come from
            let movedDocs = (de.data.options === this.props.mainDocument[Id] ? de.data.draggedDocuments : de.data.droppedDocuments);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.resolvedDataDoc, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d) => de.data.moveDocument(d, this.resolvedDataDoc, addDoc) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.resolvedDataDoc, before), false);
        }
        return false;
    }

    ScreenToLocalListTransform = (xCord: number, yCord: number) => {
        let rect = this.listContainer!.getBoundingClientRect(),
            scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
            scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        return [rect.top + scrollTop, rect.left + scrollLeft];
    }


    render() {
        const children = DocListCast(this.props.mainDocument.data);
        this.initializeGroupIds(children);
        this.initializeScaleViews(children);
        this.props.setChildrenDocs(children);
        return (
            <div className="presentationView-listCont" ref={(e) => {
                this.createListDropTarget(e!);
                this.listContainer = e!;
            }}>
                {children.map((doc: Doc, index: number) =>
                    <PresentationElement
                        ref={(e) => { if (e) { this.props.presElementsMappings.set(doc, e); } }}
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
                        setHeader={(header: React.RefObject<HTMLDivElement>) => this.header = header}
                    />
                )}
            </div>
        );
    }
}

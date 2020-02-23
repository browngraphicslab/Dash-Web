import { observer } from "mobx-react";
import React = require("react");
import { observable, action, computed, runInAction } from "mobx";
import Measure from "react-measure";
import "./SearchBoxDoc.scss";
import { Doc, DocListCast, WidthSym, HeightSym } from "../../new_fields/Doc";
import { DocumentIcon } from "./nodes/DocumentIcon";
import { StrCast, NumCast, BoolCast } from "../../new_fields/Types";
import { returnFalse, emptyFunction, returnEmptyString, returnOne } from "../../Utils";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../new_fields/ObjectField";
import { DocumentView } from "./nodes/DocumentView";
import { DocumentType } from '../documents/DocumentTypes';
import { ClientRecommender } from "../ClientRecommender";
import { DocServer } from "../DocServer";
import { Id } from "../../new_fields/FieldSymbols";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import { DocumentManager } from "../util/DocumentManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faBullseye, faLink } from "@fortawesome/free-solid-svg-icons";
import { DocUtils, Docs } from "../documents/Documents";
import { ContentFittingDocumentView } from "./nodes/ContentFittingDocumentView";
import { EditableView } from "./EditableView";

export interface RecProps {
    documents: { preview: Doc, similarity: number }[];
    node: Doc;

}

library.add(faBullseye, faLink);
export const keyPlaceholder = "Query";

@observer
export class SearchDocBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(SearchDocBox, fieldKey); }

    // @observable private _display: boolean = false;
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable.shallow private _docViews: JSX.Element[] = [];
    // @observable private _documents: { preview: Doc, score: number }[] = [];
    private previewDocs: Doc[] = [];

    constructor(props: FieldViewProps) {
        super(props);
        this.editingMetadata = this.editingMetadata || false;
    }


    @computed
    private get editingMetadata() {
        return BoolCast(this.props.Document.editingMetadata);
    }

    @computed
    private set editingMetadata(value: boolean) {
        this.props.Document.editingMetadata = value;
    }

    static readonly buffer = 20;

    componentDidMount() {
        runInAction(() => {
            this.content = (Docs.Create.TreeDocument(DocListCast(Doc.GetProto(this.props.Document).data), { _width: 200, _height: 400, _chromeStatus: "disabled", title: `Search Docs: "Results"` }));
            this.query = StrCast(this.props.Document.searchText);
        });
    }

    @observable
    private content: Doc | undefined;

    @action
    updateKey = (newKey: string) => {
        this.query = newKey;
        //this.keyRef.current && this.keyRef.current.setIsFocused(false);
        //this.query.length === 0 && (this.query = keyPlaceholder);
        return true;
    }

    @computed
    public get query() {
        return StrCast(this.props.Document.query);
    }

    public set query(value: string) {
        this.props.Document.query = value;
    }

    render() {
        const isEditing = this.editingMetadata;
        console.log(isEditing);
        return (
            <div style={{ pointerEvents: "all" }}>
                <div
                    style={{
                        position: "absolute",
                        right: 0,
                        width: 20,
                        height: 20,
                        background: "black",
                        pointerEvents: "all",
                        opacity: 1,
                        transition: "0.4s opacity ease",
                        zIndex: 99,
                    }}
                    title={"Add Metadata"}
                    onClick={action(() => this.editingMetadata = !this.editingMetadata)}
                />
                <div className="editableclass" style={{ opacity: isEditing ? 1 : 0, pointerEvents: isEditing ? "auto" : "none", transition: "0.4s opacity ease", }}>
                    <EditableView
                        contents={this.query}
                        SetValue={this.updateKey}
                        GetValue={() => ""}
                    />
                </div>
                <div style={{
                    pointerEvents: "none",
                }}>
                    <ContentFittingDocumentView {...this.props}
                        Document={this.content}
                        getTransform={this.props.ScreenToLocalTransform}>
                    </ContentFittingDocumentView>
                </div>
            </div >
        );
    }

}
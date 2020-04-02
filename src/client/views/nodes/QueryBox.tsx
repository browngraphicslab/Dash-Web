import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { IReactionDisposer, computed } from "mobx";
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { SearchBox } from "../search/SearchBox";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { emptyFunction, returnOne } from "../../../Utils";
import { DocAnnotatableComponent } from '../DocComponent';
import { makeInterface, createSchema } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { TraceMobx } from "../../../new_fields/util";
import { Id } from '../../../new_fields/FieldSymbols';
import { StrCast } from "../../../new_fields/Types";



library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);

export const pageSchema = createSchema({
    curPage: "number",
    fitWidth: "boolean",
    googlePhotosUrl: "string",
    googlePhotosTags: "string"
});


type QueryDocument = makeInterface<[typeof pageSchema, typeof documentSchema]>;
const QueryDocument = makeInterface(pageSchema, documentSchema);

@observer
export class QueryBox extends DocAnnotatableComponent<FieldViewProps, QueryDocument>(QueryDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(QueryBox, fieldKey); }
    _docListChangedReaction: IReactionDisposer | undefined;
    componentDidMount() {
    }

    componentWillUnmount() {
        this._docListChangedReaction && this._docListChangedReaction();
    }

    @computed get content() {
        let key = this.props.Document[Id];
        let sq = StrCast(this.props.Document.sq);
        let fq= StrCast(this.props.Document.fq);
        if (this.props.Document.sq){
            console.log("yes");
            console.log(sq);
            console.log(fq);
            return <SearchBox id={key} sq={sq} fq={fq}/>
        }
        else {
            console.log("no");
        return <SearchBox id={key} />
        }
    }
    contentFunc = () => [this.content];


    render() {
        const dragging = !SelectionManager.GetIsDragging() ? "" : "-dragging";
        return <div className={`queryBox${dragging}`} style={{ width: "100%", height: "100%", position: "absolute", pointerEvents: "all" }} >
            {/* <CollectionFreeFormView {...this.props}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.props.PanelWidth}
                annotationsKey={this.annotationKey}
                isAnnotationOverlay={true}
                focus={this.props.focus}
                isSelected={this.props.isSelected}
                select={emptyFunction}
                active={this.active}
                ContentScaling={returnOne}
                whenActiveChanged={this.whenActiveChanged}
                removeDocument={this.removeDocument}
                moveDocument={this.moveDocument}
                addDocument={this.addDocument}
                CollectionView={undefined}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                chromeCollapsed={true}>
                {this.contentFunc}
            </CollectionFreeFormView> */}
                {this.contentFunc()}
        </div >;
    }
}
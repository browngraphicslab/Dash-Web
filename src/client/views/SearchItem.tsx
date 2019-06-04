import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { DocumentManager } from "../util/DocumentManager";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cast } from "../../new_fields/Types";
import { FieldView, FieldViewProps } from './nodes/FieldView';
import { computed, observable } from "mobx";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../new_fields/ObjectField";
import { RichTextField } from "../../new_fields/RichTextField";
import { SetupDrag } from "../util/DragManager";


export interface SearchProps {
    doc: Doc;
}

export interface SearchItemProps {
    doc: Doc;
    subitems: FieldViewProps;
}

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.props.doc);
    }

    containingCollection(): string {
        let docView = DocumentManager.Instance.getDocumentView(this.props.doc);
        if (docView) {
            let containerView = docView.props.ContainingCollectionView;
            if (containerView) {
                let container = containerView.props.Document;
                const field = Cast(container.title, RichTextField);
                return field ? field.Data : "<p>Error loading icon data</p>";
            }
        }
        return "None";
    }

    containingCollectionView() {
        let docView = DocumentManager.Instance.getDocumentView(this.props.doc);
        if (docView) {
            let containerView = docView.props.ContainingCollectionView;
            if (containerView) {
                return containerView.props.Document;
            }
        }

        return this.props.doc;
    }

    public DocumentIcon() {
        let layoutresult = Cast(this.props.doc.layout, "string", "");

        //TODO: images showing up as collections because the layout is collectionview
        console.log(layoutresult)

        let button = layoutresult.indexOf("PDFBox") !== -1 ? faFilePdf :
            layoutresult.indexOf("ImageBox") !== -1 ? faImage :
                layoutresult.indexOf("Formatted") !== -1 ? faStickyNote :
                    layoutresult.indexOf("Video") !== -1 ? faFilm :
                        layoutresult.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} size="2x" />;
    }

    collectionRef = React.createRef<HTMLDivElement>();
    startDocDrag = () => {
        let doc = this.props.doc;
        const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
        if (isProto) {
            return Doc.MakeDelegate(doc);
        } else {
            return Doc.MakeAlias(doc);
        }
    }

    select = () => {
        // console.log('moused');
        // console.log("before:", this.props.doc[Id], this._selected)
        this._selected = !this._selected;
        // console.log("after:", this.props.doc[Id], this._selected)
    }

    linkCount = () => {
        let linkToSize = Cast(this.props.doc.linkedToDocs, listSpec(Doc), []).length;
        let linkFromSize = Cast(this.props.doc.linkedFromDocs, listSpec(Doc), []).length;
        let linkCount = linkToSize + linkFromSize;
        console.log(linkCount)
        return linkCount;
    }

    //taken from collectionschemaview, counld show doc preview to the left of the results. not sure if this should go in here
    // get previewDocument(): Doc | undefined {
    //     const children = Cast(this.props.doc[this.props.subitems.fieldKey], listSpec(Doc), []);
    //     const selected = children.length > this._selectedIndex ? FieldValue(children[this._selectedIndex]) : undefined;
    //     return selected ? (this.previewScript ? FieldValue(Cast(selected[this.previewScript], Doc)) : selected) : undefined;
    // }

    // get previewRegionHeight() { return 200; }
    // get previewRegionWidth() { return 300; }
    // private previewDocNativeWidth = () => Cast(this.previewDocument!.nativeWidth, "number", this.previewRegionWidth);
    // private previewDocNativeHeight = () => Cast(this.previewDocument!.nativeHeight, "number", this.previewRegionHeight);
    // private previewContentScaling = () => {
    //     let wscale = this.previewRegionWidth / (this.previewDocNativeWidth() ? this.previewDocNativeWidth() : this.previewRegionWidth);
    //     if (wscale * this.previewDocNativeHeight() > this.previewRegionHeight) {
    //         return this.previewRegionHeight / (this.previewDocNativeHeight() ? this.previewDocNativeHeight() : this.previewRegionHeight);
    //     }
    //     return wscale;
    // }
    // private previewPanelWidth = () => this.previewDocNativeWidth() * this.previewContentScaling();
    // private previewPanelHeight = () => this.previewDocNativeHeight() * this.previewContentScaling();
    // get previewPanelCenteringOffset() { return (this.previewRegionWidth - this.previewDocNativeWidth() * this.previewContentScaling()) / 2; }
    // getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform().translate(
    //     - this.borderWidth - this.DIVIDER_WIDTH - this.tableWidth - this.previewPanelCenteringOffset,
    //     - this.borderWidth).scale(1 / this.previewContentScaling())


    render() {
        return (
            <div>
                <div className="search-item" onMouseOver={this.select} onMouseOut={this.select} ref={this.collectionRef} id="result" onClick={this.onClick} onPointerDown={SetupDrag(this.collectionRef, this.startDocDrag)} >
                    <div className="search-title" id="result" >title: {this.props.doc.title}</div>
                    <div className="search-info">
                        <div className="link-count">{this.linkCount()}</div>
                        <div className="search-type" >{this.DocumentIcon()}</div>
                    </div>
                </div>
                <div className="expanded-result" style={this._selected ? { display: "flex" } : { display: "none" }}>
                    <div className="collection-label">Collection: {this.containingCollection()}</div>
                    <div className="preview"></div>
                </div>
            </div>
        );
    }
} 
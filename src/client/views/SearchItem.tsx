import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { DocumentManager } from "../util/DocumentManager";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cast } from "../../new_fields/Types";
import { FieldView, FieldViewProps } from './nodes/FieldView';
import { computed, observable, action, runInAction } from "mobx";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../new_fields/ObjectField";
import { RichTextField } from "../../new_fields/RichTextField";
import { SetupDrag } from "../util/DragManager";
import { SearchUtil } from "../util/SearchUtil";
import { Id } from "../../new_fields/FieldSymbols";
import { ViewItem } from "./ViewItem";


export interface SearchProps {
    doc: Doc;
    views: Doc[];
}

export interface SearchItemProps {
    doc: Doc;
    views: Doc[];
    // subitems: FieldViewProps;
}

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);

export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;

    @observable
    private _instances: Doc[] = [];

    // @action
    // getViews = async () => {
    //     const results = await SearchUtil.GetViewsOfDocument(this.props.doc);
    //     runInAction(() => {
    //         this._instances = results;
    //     });
    // }

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.props.doc);
    }

    //something wrong with this
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

    //also probably with this rip
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
        let layoutresult = Cast(this.props.doc.type, "string", "");

        let button = layoutresult.indexOf("pdf") !== -1 ? faFilePdf :
            layoutresult.indexOf("image") !== -1 ? faImage :
                layoutresult.indexOf("text") !== -1 ? faStickyNote :
                    layoutresult.indexOf("video") !== -1 ? faFilm :
                        layoutresult.indexOf("collection") !== -1 ? faObjectGroup :
                            layoutresult.indexOf("audio") !== -1 ? faMusic :
                                layoutresult.indexOf("link") !== -1 ? faLink :
                                    layoutresult.indexOf("histogram") !== -1 ? faChartBar :
                                        layoutresult.indexOf("web") !== -1 ? faGlobeAsia :
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
        // console.log("before:", this.props.doc, this._selected)
        this._selected = !this._selected;
        // console.log("after:", this.props.doc, this._selected)
    }

    linkCount = () => {
        console.log("counting")
        let linkToSize = Cast(this.props.doc.linkedToDocs, listSpec(Doc), []).length;
        let linkFromSize = Cast(this.props.doc.linkedFromDocs, listSpec(Doc), []).length;
        let linkCount = linkToSize + linkFromSize;
        return linkCount;
    }

    render() {
        return (
            <div className="search-overview" onMouseOver={this.select} onMouseOut={this.select}>
                <div className="searchBox-instances">
                    {this.props.views.map(result => <ViewItem doc={result} key={result[Id]} />)}
                </div>
                <div className="search-item" ref={this.collectionRef} id="result" onClick={this.onClick} onPointerDown={SetupDrag(this.collectionRef, this.startDocDrag)} >
                    <div className="main-search-info">
                        <div className="search-title" id="result" >{this.props.doc.title}</div>
                        <div className="search-info">
                            <div className="link-count">{this.linkCount()}</div>
                            <div className="search-type" >{this.DocumentIcon()}</div>
                        </div>
                    </div>
                    <div className="more-search-info">
                        <div className="found">Where Found: (i.e. title, body, etc)</div>
                        {/* <div className="containing-collection">Collection: {this.containingCollection()}</div> */}
                    </div>
                </div>

                {/* <div className="expanded-result" style={this._selected ? { display: "flex" } : { display: "none" }}>
                    <div className="collection-label">Collection: {this.containingCollection()}</div>
                    <div className="preview"></div>
                </div> */}
            </div>
        );
    }
} 
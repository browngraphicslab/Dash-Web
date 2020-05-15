import { observer } from "mobx-react";
import React = require("react");
import { observable, action, computed, runInAction } from "mobx";
import Measure from "react-measure";
import "./RecommendationsBox.scss";
import { Doc, DocListCast, WidthSym, HeightSym } from "../../fields/Doc";
import { DocumentIcon } from "./nodes/DocumentIcon";
import { StrCast, NumCast } from "../../fields/Types";
import { returnFalse, emptyFunction, returnEmptyString, returnOne, emptyPath, returnZero } from "../../Utils";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../fields/ObjectField";
import { DocumentView } from "./nodes/DocumentView";
import { DocumentType } from '../documents/DocumentTypes';
import { ClientRecommender } from "../ClientRecommender";
import { DocServer } from "../DocServer";
import { Id } from "../../fields/FieldSymbols";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import { DocumentManager } from "../util/DocumentManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faBullseye, faLink } from "@fortawesome/free-solid-svg-icons";
import { DocUtils } from "../documents/Documents";

export interface RecProps {
    documents: { preview: Doc, similarity: number }[];
    node: Doc;
}

library.add(faBullseye, faLink);

@observer
export class RecommendationsBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(RecommendationsBox, fieldKey); }

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
    }

    @action
    private DocumentIcon(doc: Doc) {
        const layoutresult = StrCast(doc.type);
        let renderDoc = doc;
        //let box: number[] = [];
        if (layoutresult.indexOf(DocumentType.COL) !== -1) {
            renderDoc = Doc.MakeDelegate(renderDoc);
        }
        const returnXDimension = () => 150;
        const returnYDimension = () => 150;
        const scale = () => returnXDimension() / NumCast(renderDoc.nativeWidth, returnXDimension());
        //let scale = () => 1;
        const newRenderDoc = Doc.MakeAlias(renderDoc); ///   newRenderDoc -> renderDoc -> render"data"Doc -> TextProt
        newRenderDoc.height = NumCast(this.props.Document.documentIconHeight);
        newRenderDoc.autoHeight = false;
        const docview = <div>
            <DocumentView
                fitToBox={StrCast(doc.type).indexOf(DocumentType.COL) !== -1}
                Document={newRenderDoc}
                addDocument={returnFalse}
                LibraryPath={emptyPath}
                removeDocument={returnFalse}
                rootSelected={returnFalse}
                ScreenToLocalTransform={Transform.Identity}
                addDocTab={returnFalse}
                pinToPres={returnFalse}
                renderDepth={1}
                NativeHeight={returnZero}
                NativeWidth={returnZero}
                PanelWidth={returnXDimension}
                PanelHeight={returnYDimension}
                focus={emptyFunction}
                backgroundColor={returnEmptyString}
                parentActive={returnFalse}
                whenActiveChanged={returnFalse}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                ContentScaling={scale}
            />
        </div>;
        return docview;

    }

    // @action
    // closeMenu = () => {
    //     this._display = false;
    //     this.previewDocs.forEach(doc => DocServer.DeleteDocument(doc[Id]));
    //     this.previewDocs = [];
    // }

    // @action
    // resetDocuments = () => {
    //     this._documents = [];
    // }

    // @action
    // displayRecommendations(x: number, y: number) {
    //     this._pageX = x;
    //     this._pageY = y;
    //     this._display = true;
    // }

    static readonly buffer = 20;

    // get pageX() {
    //     const x = this._pageX;
    //     if (x < 0) {
    //         return 0;
    //     }
    //     const width = this._width;
    //     if (x + width > window.innerWidth - RecommendationsBox.buffer) {
    //         return window.innerWidth - RecommendationsBox.buffer - width;
    //     }
    //     return x;
    // }

    // get pageY() {
    //     const y = this._pageY;
    //     if (y < 0) {
    //         return 0;
    //     }
    //     const height = this._height;
    //     if (y + height > window.innerHeight - RecommendationsBox.buffer) {
    //         return window.innerHeight - RecommendationsBox.buffer - height;
    //     }
    //     return y;
    // }

    // get createDocViews() {
    //     return DocListCast(this.props.Document.data).map(doc => {
    //         return (
    //             <div className="content">
    //                 <span style={{ height: NumCast(this.props.Document.documentIconHeight) }} className="image-background">
    //                     {this.DocumentIcon(doc)}
    //                 </span>
    //                 <span className="score">{NumCast(doc.score).toFixed(4)}</span>
    //                 <div style={{ marginRight: 50 }} onClick={() => DocumentManager.Instance.jumpToDocument(doc, false)}>
    //                     <FontAwesomeIcon className="documentdecorations-icon" icon={"bullseye"} size="sm" />
    //                 </div>
    //                 <div style={{ marginRight: 50 }} onClick={() => DocUtils.MakeLink({ doc: this.props.Document.sourceDoc as Doc }, { doc: doc }, "User Selected Link", "Generated from Recommender", undefined)}>
    //                     <FontAwesomeIcon className="documentdecorations-icon" icon={"link"} size="sm" />
    //                 </div>
    //             </div>
    //         );
    //     });
    // }

    componentDidMount() { //TODO: invoking a computedFn from outside an reactive context won't be memoized, unless keepAlive is set
        runInAction(() => {
            if (this._docViews.length === 0) {
                this._docViews = DocListCast(this.props.Document.data).map(doc => {
                    return (
                        <div className="content">
                            <span style={{ height: NumCast(this.props.Document.documentIconHeight) }} className="image-background">
                                {this.DocumentIcon(doc)}
                            </span>
                            <span className="score">{NumCast(doc.score).toFixed(4)}</span>
                            <div style={{ marginRight: 50 }} onClick={() => DocumentManager.Instance.jumpToDocument(doc, false)}>
                                <FontAwesomeIcon className="documentdecorations-icon" icon={"bullseye"} size="sm" />
                            </div>
                            <div style={{ marginRight: 50 }} onClick={() => DocUtils.MakeLink({ doc: this.props.Document.sourceDoc as Doc }, { doc: doc }, "Recommender", undefined)}>
                                <FontAwesomeIcon className="documentdecorations-icon" icon={"link"} size="sm" />
                            </div>
                        </div>
                    );
                });
            }
        });
    }

    render() { //TODO: Invariant violation: max depth exceeded error. Occurs when images are rendered. 
        // if (!this._display) {
        //     return null;
        // }
        // let style = { left: this.pageX, top: this.pageY };
        //const transform = "translate(" + (NumCast(this.props.node.x) + 350) + "px, " + NumCast(this.props.node.y) + "px"
        let title = StrCast((this.props.Document.sourceDoc as Doc).title);
        if (title.length > 15) {
            title = title.substring(0, 15) + "...";
        }
        return (
            <div className="rec-scroll">
                <p>Recommendations for "{title}"</p>
                {this._docViews}
            </div>
        );
    }
    // 
    // 
}
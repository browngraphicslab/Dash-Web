import { observer } from "mobx-react";
import React = require("react");
import { observable, action } from "mobx";
import Measure from "react-measure";
import "./Recommendations.scss";
import { Doc, DocListCast, WidthSym, HeightSym } from "../../new_fields/Doc";
import { DocumentIcon } from "./nodes/DocumentIcon";
import { StrCast, NumCast } from "../../new_fields/Types";
import { returnFalse, emptyFunction, returnEmptyString, returnOne } from "../../Utils";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../new_fields/ObjectField";
import { DocumentView } from "./nodes/DocumentView";
import { DocumentType } from '../documents/DocumentTypes';
import { ClientRecommender } from "../ClientRecommender";
import { DocServer } from "../DocServer";
import { Id } from "../../new_fields/FieldSymbols";

export interface RecProps {
    documents: { preview: Doc, similarity: number }[];
    node: Doc;
}

@observer
export class Recommendations extends React.Component<{}> {

    static Instance: Recommendations;
    @observable private _display: boolean = false;
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _documents: { preview: Doc, score: number }[] = [];
    private previewDocs: Doc[] = [];

    constructor(props: {}) {
        super(props);
        Recommendations.Instance = this;
    }

    private DocumentIcon(doc: Doc) {
        let layoutresult = StrCast(doc.type);
        let renderDoc = doc;
        //let box: number[] = [];
        if (layoutresult.indexOf(DocumentType.COL) !== -1) {
            renderDoc = Doc.MakeDelegate(renderDoc);
            let bounds = DocListCast(renderDoc.data).reduce((bounds, doc) => {
                var [sptX, sptY] = [NumCast(doc.x), NumCast(doc.y)];
                let [bptX, bptY] = [sptX + doc[WidthSym](), sptY + doc[HeightSym]()];
                return {
                    x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                    r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
                };
            }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
        }
        let returnXDimension = () => 50;
        let returnYDimension = () => 50;
        let scale = () => returnXDimension() / NumCast(renderDoc.nativeWidth, returnXDimension());
        //let scale = () => 1;
        let newRenderDoc = Doc.MakeAlias(renderDoc); ///   newRenderDoc -> renderDoc -> render"data"Doc -> TextProt
        newRenderDoc.height = 50;
        newRenderDoc.autoHeight = false;
        const docview = <div>
            {/* onPointerDown={action(() => {
                this._useIcons = !this._useIcons;
                this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
            })}
            onPointerEnter={action(() => this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE))}
            onPointerLeave={action(() => this._displayDim = 50)} > */}
            <DocumentView
                fitToBox={StrCast(doc.type).indexOf(DocumentType.COL) !== -1}
                Document={newRenderDoc}
                addDocument={returnFalse}
                removeDocument={returnFalse}
                ScreenToLocalTransform={Transform.Identity}
                addDocTab={returnFalse}
                renderDepth={1}
                PanelWidth={returnXDimension}
                PanelHeight={returnYDimension}
                focus={emptyFunction}
                backgroundColor={returnEmptyString}
                selectOnLoad={false}
                parentActive={returnFalse}
                whenActiveChanged={returnFalse}
                bringToFront={emptyFunction}
                zoomToScale={emptyFunction}
                getScale={returnOne}
                ContainingCollectionView={undefined}
                ContentScaling={scale}
            />
        </div>;
        // const data = renderDoc.data;
        // if (data instanceof ObjectField) newRenderDoc.data = ObjectField.MakeCopy(data);
        // newRenderDoc.preview = true;
        // this.previewDocs.push(newRenderDoc);
        return docview;

    }

    @action
    closeMenu = () => {
        this._display = false;
        this.previewDocs.forEach(doc => DocServer.DeleteDocument(doc[Id]));
        this.previewDocs = [];
    }

    @action
    resetDocuments = () => {
        this._documents = [];
    }

    @action
    addDocuments = (documents: { preview: Doc, score: number }[]) => {
        this._documents = documents;
    }

    @action
    displayRecommendations(x: number, y: number) {
        this._pageX = x;
        this._pageY = y;
        this._display = true;
    }

    static readonly buffer = 20;

    get pageX() {
        const x = this._pageX;
        if (x < 0) {
            return 0;
        }
        const width = this._width;
        if (x + width > window.innerWidth - Recommendations.buffer) {
            return window.innerWidth - Recommendations.buffer - width;
        }
        return x;
    }

    get pageY() {
        const y = this._pageY;
        if (y < 0) {
            return 0;
        }
        const height = this._height;
        if (y + height > window.innerHeight - Recommendations.buffer) {
            return window.innerHeight - Recommendations.buffer - height;
        }
        return y;
    }

    render() {
        if (!this._display) {
            return null;
        }
        let style = { left: this.pageX, top: this.pageY };
        //const transform = "translate(" + (NumCast(this.props.node.x) + 350) + "px, " + NumCast(this.props.node.y) + "px"
        return (
            <Measure offset onResize={action((r: any) => { this._width = r.offset.width; this._height = r.offset.height; })}>
                {({ measureRef }) => (
                    <div className="rec-scroll" style={style} ref={measureRef}>
                        <p>Recommendations</p>
                        {this._documents.map(doc => {
                            return (
                                <div className="content">
                                    <span className="image-background">
                                        {this.DocumentIcon(doc.preview)}
                                    </span>
                                    <span className="score">{doc.score.toFixed(4)}</span>
                                </div>
                            );
                        })}

                    </div>
                )
                }

            </Measure>
        );
    }
}
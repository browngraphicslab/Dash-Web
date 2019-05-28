import React = require("react");
import { observer } from "mobx-react";
import { CollectionSubView, CollectionViewProps, SubCollectionViewProps } from "./CollectionSubView";
import { Doc, WidthSym, HeightSym, DocListCast } from "../../../new_fields/Doc";
import { DocumentView } from "../nodes/DocumentView";
import { Transform } from "../../util/Transform";
import { emptyFunction, returnOne } from "../../../Utils";
import "./CollectionStackingView.scss";
import { action, reaction } from "mobx";
import { StrCast, NumCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";



@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform();

    constructor(props: SubCollectionViewProps) {
        super(props);
        // reaction(() => [this.props.PanelHeight() + this.props.PanelWidth(),
        // (this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document[this.props.ContainingCollectionView.props.fieldKey])], () => {
        //         if (this.props.ContainingCollectionView) {
        //             let allItems = DocListCast(this.props.ContainingCollectionView.props.Document[this.props.ContainingCollectionView.props.fieldKey]);
        //             for (let x = 0; x < allItems.length; x++) {
        //                 resizeGridItem(allItems[x]);
        //             }
        //         }
        //     }
        // );
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }
    render() {
        const docs = this.childDocs;
        let gridGap = 10;
        let gridSize = 20;
        let itemWidth = NumCast(this.props.Document.itemWidth, 250);
        let leftMargin = 20;
        let topMargin = 20;
        let itemCols = Math.ceil(itemWidth / (gridSize + gridGap));
        let cells = Math.floor((this.props.PanelWidth() - leftMargin) / (itemCols * (gridSize + gridGap)));
        return (
            <div className="collectionStackingView" ref={this.createDropTarget} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="collectionStackingview-masonryGrid"
                    style={{
                        padding: `${topMargin}px 0px 0px ${leftMargin}px`,
                        width: `${cells * itemCols * (gridSize + gridGap) + leftMargin}`,
                        margin: "auto", position: "relative",
                        gridGap: gridGap,
                        gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px,1fr))`,
                        gridAutoRows: `${gridSize}px`
                    }}
                >
                    {docs.map(d => {
                        let colSpan = Math.ceil((itemWidth + gridGap) / (gridSize + gridGap));
                        let rowSpan = Math.ceil((itemWidth / d[WidthSym]() * d[HeightSym]() + gridGap) / (gridSize + gridGap));
                        return (<div className="mycontent" id={StrCast(d.title, "")}
                            key={d[Id]}
                            style={{
                                transformOrigin: "top left",
                                gridRowEnd: `span  ${rowSpan}`,
                                gridColumnEnd: `span  ${colSpan}`,
                                transform: `scale(${itemWidth / NumCast(d.nativeWidth, 1)}, ${itemWidth / NumCast(d.nativeWidth, 1)})`
                            }} >
                            <DocumentView Document={d}
                                addDocument={this.props.addDocument}
                                removeDocument={this.props.removeDocument}
                                moveDocument={this.moveDocument}
                                ContainingCollectionView={this.props.CollectionView}
                                isTopMost={false}
                                ScreenToLocalTransform={this.getPreviewTransform}
                                focus={emptyFunction}
                                ContentScaling={returnOne}
                                PanelWidth={d[WidthSym]}
                                PanelHeight={d[HeightSym]}
                                selectOnLoad={false}
                                parentActive={this.props.active}
                                addDocTab={this.props.addDocTab}
                                bringToFront={emptyFunction}
                                toggleMinimized={emptyFunction}
                                whenActiveChanged={this.props.active} />
                        </div>);
                    })}
                </div>
            </div>
        );
    }
}
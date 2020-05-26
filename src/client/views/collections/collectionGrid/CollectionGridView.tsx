import { computed, observable, Lambda } from 'mobx';
import * as React from "react";
import { Doc, DocListCast, Opt } from '../../../../fields/Doc';
import { documentSchema } from '../../../../fields/documentSchemas';
import { makeInterface } from '../../../../fields/Schema';
import { BoolCast, NumCast, ScriptCast, StrCast } from '../../../../fields/Types';
import { Transform } from '../../../util/Transform';
import { undoBatch } from '../../../util/UndoManager';
import { ContentFittingDocumentView } from '../../nodes/ContentFittingDocumentView';
import { CollectionSubView } from '../CollectionSubView';
import { SubCollectionViewProps } from '../CollectionSubView';
import { List } from '../../../../fields/List';
import { returnZero } from '../../../../Utils';
import Grid, { Layout } from "./Grid";
import { Id } from '../../../../fields/FieldSymbols';
import { observer } from 'mobx-react';
import "./CollectionGridView.scss";

type GridSchema = makeInterface<[typeof documentSchema]>;
const GridSchema = makeInterface(documentSchema);

@observer
export class CollectionGridView extends CollectionSubView(GridSchema) {
    private changeListenerDisposer: Opt<Lambda>;

    constructor(props: Readonly<SubCollectionViewProps>) {
        super(props);
        this.props.Document.numCols = NumCast(this.props.Document.numCols, 10);
        this.props.Document.rowHeight = NumCast(this.props.Document.rowHeight, 100);
    }

    componentDidMount() {
        if (!this.props.Document.gridLayouts) {
            this.props.Document.gridLayouts = new List<Doc>();
        }
        this.changeListenerDisposer = computed(() => this.childLayoutPairs).observe(({ oldValue, newValue }) => {
            if (!oldValue) {
                // on page's initial load
                return;
            }
            const gridLayouts = DocListCast(this.props.Document.gridLayouts);
            const previousLength = oldValue.length;
            const currentLength = newValue.length;

            if (currentLength > previousLength) {
                // for each document that was added, add a corresponding grid layout document
                newValue.forEach(({ layout }) => {
                    const targetId = layout[Id];
                    if (!gridLayouts.find((gridLayout: Doc) => StrCast(gridLayout.i) === targetId)) {
                        const layoutDoc: Doc = new Doc();
                        layoutDoc.i = targetId;
                        layoutDoc.w = 2;
                        layoutDoc.h = 2;
                        this.findNextLayout(layoutDoc, previousLength);
                        Doc.AddDocToList(this.props.Document, "gridLayouts", layoutDoc);
                    }
                });
            } else {
                // for each document that was removed, remove its corresponding grid layout document
                oldValue.forEach(({ layout }) => {
                    const targetId = layout[Id];
                    if (!newValue.find(({ layout: preserved }) => preserved[Id] === targetId)) {
                        const gridLayoutDoc = gridLayouts.find((gridLayout: Doc) => StrCast(gridLayout.i) === targetId);
                        gridLayoutDoc && Doc.RemoveDocFromList(this.props.Document, "gridLayouts", gridLayoutDoc);
                    }
                });
            }
        }, true);
    }

    componentWillUnmount() {
        this.changeListenerDisposer && this.changeListenerDisposer();
    }

    /**
     * Establishes the x and y properties of the @param layoutDoc, currently
     * using the @param previousLength for the computations.
     * 
     * However, this could also be more of a first fit algorithm, iterating through
     * this.toLayoutList(DocListCast(this.props.Document.gridLayouts)) and finding the
     * first gap in the layout structure that suits the width and height. It would be
     * easiest to see that a column is free (for a given row, if two documents' x are separated
     * by a value greater than the ratio width of the document you're trying to insert),
     * but you would then have to ensure that the next row at that column has a y at least
     * as big as the ratio height of the document you're trying to insert.  
     */
    private findNextLayout(layoutDoc: Doc, previousLength: number) {
        layoutDoc.x = 2 * (previousLength % 5);
        layoutDoc.y = 2 * Math.floor(previousLength / 5);
    }

    /**
     * @returns the transform that will correctly place
     * the document decorations box, shifted to the right by
     * the sum of all the resolved column widths of the
     * documents before the target. 
     */
    private lookupIndividualTransform = (doc: Doc) => {
        const yTranslation = (this.props.Document.rowHeight as number) * (doc.y as number) + 10 * (doc.y as number);
        return this.props.ScreenToLocalTransform().translate(-this.props.PanelWidth() / (this.props.Document.numCols as number) * (doc.x as number), -yTranslation);
    }


    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    /**
     * Sets the width of the decorating box.
     * @param Doc doc
     */
    @observable private width = (doc: Doc) => doc.w as number * this.props.PanelWidth() / (this.props.Document.numCols as number);

    /**
     * Sets the height of the decorating box.
     * @param doc `Doc`
     */
    @observable private height = (doc: Doc) => doc.h as number * (this.props.Document.rowHeight as number);

    addDocTab = (doc: Doc, where: string) => {
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = new List<Doc>([doc]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    }

    getDisplayDoc(layout: Doc, dxf: () => Transform, width: () => number, height: () => number) {
        return <ContentFittingDocumentView
            {...this.props}
            Document={layout}
            DataDoc={layout.resolvedDataDoc as Doc}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            addDocTab={this.addDocTab}
            fitToBox={BoolCast(this.props.Document._freezeChildDimensions)}
            FreezeDimensions={BoolCast(this.props.Document._freezeChildDimensions)}
            backgroundColor={this.props.backgroundColor}
            ContainingCollectionDoc={this.props.Document}
            PanelWidth={width}
            PanelHeight={height}
            ScreenToLocalTransform={dxf}
            onClick={this.onChildClickHandler}
            renderDepth={this.props.renderDepth + 1}
            parentActive={this.props.active}
            display={"contents"}
        />;
    }


    /**
     * Saves the layouts received from the Grid to the Document.
     * @param layouts `Layout[]`
     */
    @undoBatch
    setLayout(layouts: Layout[]) {
        // for every child in the collection, check to see if there's a corresponding grid layout document and
        // updated layout object. If both exist, which they should, update the grid layout document from the updated object 
        this.childLayoutPairs.forEach(({ layout: doc }) => {
            let update: Opt<Layout>;
            const targetId = doc[Id];
            const gridLayout = DocListCast(this.props.Document.gridLayouts).find(gridLayout => StrCast(gridLayout.i) === targetId);
            if (gridLayout && (update = layouts.find(layout => layout.i === targetId))) {
                gridLayout.x = update.x;
                gridLayout.y = update.y;
                gridLayout.w = update.w;
                gridLayout.h = update.h;
            }
        });
    }

    // _.reject() on item removal?

    /**
     * @returns a list of `ContentFittingDocumentView`s inside wrapper divs.
     * The key of the wrapper div must be the same as the `i` value of the corresponding layout.
     */
    @computed
    private get contents(): JSX.Element[] {
        const { childLayoutPairs } = this;
        const collector: JSX.Element[] = [];
        const docList: Doc[] = DocListCast(this.props.Document.gridLayouts);
        if (!docList.length) {
            return [];
        }

        for (let i = 0; i < childLayoutPairs.length; i++) {
            const { layout } = childLayoutPairs[i];
            const gridLayout = docList[i];
            const dxf = () => this.lookupIndividualTransform(gridLayout);
            const width = () => this.width(gridLayout);
            const height = () => this.height(gridLayout);
            collector.push(
                <div className={"document-wrapper"}
                    key={gridLayout.i as string}
                >
                    {this.getDisplayDoc(layout, dxf, width, height)}
                </div>
            );
        }

        return collector;
    }

    /**
     * @returns a list of Layouts from a list of Docs
     * @param docLayoutList `Doc[]`
     */
    toLayoutList(docLayoutList: Doc[]): Layout[] {
        return docLayoutList.map(({ i, x, y, w, h }) => ({
            i: i as string,
            x: x as number,
            y: y as number,
            w: w as number,
            h: h as number
        }));
    }

    /**
     * DocListCast only includes *resolved* documents, i.e. filters out promises. So even if we have a nonzero
     * number of documents in either of these Dash lists on the document, the DocListCast version may evaluate to empty
     * if the corresponding documents are all promises, waiting to be fetched from the server. If we don't return early
     * in the event that promises are encountered, we might feed inaccurate data to the grid since the corresponding gridLayout
     * documents are unresolved (or the grid may misinterpret an empty array) which has the unfortunate byproduct of triggering
     * the setLayout event, which makes these unintended changes permanent by writing them to the likely now resolved documents.
     */
    render() {
        const layoutDocList: Doc[] = DocListCast(this.props.Document.gridLayouts);
        const childDocumentViews: JSX.Element[] = this.contents;
        return !(childDocumentViews.length && layoutDocList.length) ? null : (
            <div className="collectionGridView_contents"
                style={{
                    marginLeft: NumCast(this.props.Document._xMargin), marginRight: NumCast(this.props.Document._xMargin),
                    marginTop: NumCast(this.props.Document._yMargin), marginBottom: NumCast(this.props.Document._yMargin)
                }}
                ref={this.createDashEventsTarget}
            >
                <Grid
                    width={this.props.PanelWidth()}
                    nodeList={childDocumentViews}
                    layout={this.toLayoutList(layoutDocList)}
                    numCols={this.props.Document.numCols as number}
                    rowHeight={this.props.Document.rowHeight as number}
                    setLayout={(layout: Layout[]) => this.setLayout(layout)}
                />
            </div>
        );
    }
}

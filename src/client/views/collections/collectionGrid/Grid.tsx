import * as React from 'react';
import { observer } from "mobx-react";


import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";

import * as GridLayout from 'react-grid-layout';
import { Layout } from 'react-grid-layout';
import { CollectionGridView } from './CollectionGridView';
export { Layout } from 'react-grid-layout';


interface GridProps {
    width: number;
    nodeList: JSX.Element[] | null;
    layout: Layout[];
    gridView: CollectionGridView;
    numCols: number;
    rowHeight: number;
}

/**
 * Wrapper around the actual GridLayout of `react-grid-layout`.
 */
@observer
export default class Grid extends React.Component<GridProps, GridLayout.ResponsiveProps> {

    /**
     * If there has been a change in layout, calls a method in CollectionGridView to set the layouts on the Document.
     * @param layout `Layout[]`
     */
    onLayoutChange(layout: Layout[]) {
        this.props.gridView.layout = layout;
    }

    render() {
        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={this.props.numCols}
                rowHeight={this.props.rowHeight}
                width={this.props.width}
                compactType={null}
                isDroppable={true}
                margin={[10, 10]}
                onLayoutChange={layout => this.onLayoutChange(layout)}
            >
                {this.props.nodeList}
            </GridLayout >
        );
    }
}

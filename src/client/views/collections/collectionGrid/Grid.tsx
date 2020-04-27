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
}

@observer
export default class Grid extends React.Component<GridProps, GridLayout.ResponsiveProps> {

    onLayoutChange(layout: Layout[]) {
        // for (let i = 0; i < this.props.nodeList!.length; i++) {
        //     this.props.layout[i] = layout[i];
        // }
        console.log("REACHED");
        this.props.gridView.layout = layout;
    }
    render() {
        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={10}
                rowHeight={100}
                width={this.props.width}
                compactType={null}
                isDroppable={true}
                onLayoutChange={layout => this.onLayoutChange(layout)}
            >
                {this.props.nodeList}
            </GridLayout >
        );
    }
}

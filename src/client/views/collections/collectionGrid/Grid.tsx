import * as React from 'react';
import { observer } from "mobx-react";


import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";

import * as GridLayout from 'react-grid-layout';
import { Layout } from 'react-grid-layout';
export { Layout } from 'react-grid-layout';


interface GridProps {
    width: number;
    nodeList: JSX.Element[] | null;
    layout: Layout[];
    numCols: number;
    rowHeight: number;
    setLayout: Function;
    flex: boolean;
    scale: number;
}

/**
 * Wrapper around the actual GridLayout of `react-grid-layout`.
 */
@observer
export default class Grid extends React.Component<GridProps> {

    constructor(props: Readonly<GridProps>) {
        super(props);

        this.onLayoutChange = this.onLayoutChange.bind(this);
    }
    /**
     * If there has been a change in layout, calls a method in CollectionGridView to set the layouts on the Document.
     * @param layout `Layout[]`
     */
    onLayoutChange(layout: Layout[]) {
        console.log("setting in grid component" + layout[0]?.w);
        // if (this.props.flex) {
        this.props.setLayout(layout);
        // }
    }

    Scale = 2
    render() {
        console.log("In grid layout prop received value= " + this.props.layout?.[0]?.w);
        return (
            <GridLayout className="layout"
                layout={this.props.layout}
                cols={this.props.numCols}
                rowHeight={this.props.rowHeight}
                width={this.props.width}
                compactType={null}
                isDroppable={true}
                useCSSTransforms={true}
                margin={[10, 10]}
                onLayoutChange={this.onLayoutChange}
                preventCollision={true}
                transformScale={this.props.scale}
            >
                {this.props.nodeList}
            </GridLayout >
        );
    }
}

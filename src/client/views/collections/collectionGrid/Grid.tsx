import * as React from 'react';
import { observer } from "mobx-react";


import "../../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../../node_modules/react-resizable/css/styles.css";

import * as GridLayout from 'react-grid-layout';

interface GridProps {
    width: number;
    nodeList: JSX.Element[] | null;
    layout: any;
}

@observer
export default class Grid extends React.Component<GridProps, GridLayout.ResponsiveProps> {
    render() {
        // layout is an array of objects, see the demo for more complete usage
        // const layout = [
        //     { i: 'wrapper0', x: 0, y: 0, w: 2, h: 2 },//, static: true },
        //     { i: 'wrapper1', x: 2, y: 0, w: 2, h: 2 },// minW: 2, maxW: 4 },
        //     { i: 'wrapper2', x: 4, y: 0, w: 2, h: 2 },
        //     { i: 'wrapper3', x: 6, y: 0, w: 2, h: 2 },// minW: 2, maxW: 4 },
        //     { i: 'wrapper4', x: 8, y: 0, w: 2, h: 2 }
        // ];
        return (
            <GridLayout className="layout" layout={this.props.layout} cols={10} rowHeight={100} width={this.props.width}>
                {this.props.nodeList}
            </GridLayout>
        );
    }
}

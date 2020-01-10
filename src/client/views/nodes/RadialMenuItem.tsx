import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { UndoManager } from "../../util/UndoManager";

library.add(faAngleRight);

export interface OriginalMenuProps {
    description: string;
    event: (stuff?: any) => void;
    undoable?: boolean;
    icon: IconProp;
    closeMenu?: () => void;
    min?: number;
    max?:number;
    selected:number;
}


export type RadialMenuProps = OriginalMenuProps;

@observer
export class RadialMenuItem extends React.Component<RadialMenuProps & { selected?: boolean }> {

    componentDidMount = () =>{
        this.setcircle();
    }

    componentDidUpdate = () =>{
        this.setcircle();
    }

    handleEvent = async (e: React.MouseEvent<HTMLDivElement>) => {
        if ("event" in this.props) {
            this.props.closeMenu && this.props.closeMenu();
            let batch: UndoManager.Batch | undefined;
            if (this.props.undoable !== false) {
                batch = UndoManager.StartBatch(`Context menu event: ${this.props.description}`);
            }
            await this.props.event({ x: e.clientX, y: e.clientY });
            batch && batch.end();
        }
    }


    setcircle(){
        let circlemin=0;
        let circlemax=1
        this.props.min? circlemin=this.props.min:null;
        this.props.max? circlemax=this.props.max:null;
        if (document.getElementById("myCanvas")!==null){
        var c : any= document.getElementById("myCanvas");
        let color = "white"
        switch(circlemin%3){
            case 1:
                color = "#c2c2c5";
                break;
            case 0:
                color = "white";
                break;
            case 2:
                color = "lightgray";
                break;
        }
        if (circlemax%3===1 && circlemin===circlemax-1){
            color="#c2c2c5";
        }

        if (this.props.selected === this.props.min){
            color="#808080";
        
        }
        if (c.getContext){
        var ctx = c.getContext("2d");
        ctx.beginPath();
        ctx.arc(150, 150, 150, (circlemin/circlemax)*2*Math.PI, ((circlemin+1)/circlemax) * 2 * Math.PI);
        ctx.arc(150, 150, 50, ((circlemin+1)/circlemax)*2*Math.PI, (circlemin/circlemax) * 2 * Math.PI,true);
        ctx.fillStyle=color;
        ctx.fill()
        }
    }
    }

    calculatorx(){
        let circlemin=0;
        let circlemax=1
        this.props.min? circlemin=this.props.min:null;
        this.props.max? circlemax=this.props.max:null;
        let avg = ((circlemin/circlemax)+((circlemin+1)/circlemax))/2;
        let degrees = 360*avg;
        let x= 100*Math.cos(degrees*Math.PI/180);
        let y =-125*Math.sin(degrees*Math.PI/180);
        return x;
    }

    calculatory(){
        
        let circlemin=0;
        let circlemax=1
        this.props.min? circlemin=this.props.min:null;
        this.props.max? circlemax=this.props.max:null;
        let avg = ((circlemin/circlemax)+((circlemin+1)/circlemax))/2;
        let degrees = 360*avg;
        let x= 125*Math.cos(degrees*Math.PI/180);
        let y =-100*Math.sin(degrees*Math.PI/180);
        return y;
    }


    render() {
            return (
                <div className={"radialMenu-item" + (this.props.selected ? " radialMenu-itemSelected" : "")} onClick={this.handleEvent}>
                    <canvas id="myCanvas" height="300" width="300"> Your browser does not support the HTML5 canvas tag.</canvas>
                    <FontAwesomeIcon icon={this.props.icon} size="3x" style={{ position:"absolute", left:this.calculatorx()+150-19, top:this.calculatory()+150-19}} />
                </div>
            );
    }
}
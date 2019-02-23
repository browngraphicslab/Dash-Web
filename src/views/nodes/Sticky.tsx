import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { SelectionManager } from "../../util/SelectionManager";
import "./ImageBox.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import 'react-pdf/dist/Page/AnnotationLayer.css'
//@ts-ignore
import { Document, Page, PDFPageProxy, PageAnnotation} from "react-pdf";
import { Utils } from '../../Utils';


interface IProps{
    Height:number; 
    Width:number; 
    X:number;
    Y:number;
}



@observer
export class Sticky extends React.Component<IProps> {

    
    private initX:number = 0; 
    private initY:number = 0; 

    private _ref = React.createRef<HTMLCanvasElement>(); 
    private ctx:any;
  


    drawDown = (e:React.PointerEvent) => {
        if (this._ref.current){
            this.ctx = this._ref.current.getContext("2d");
            let mouse = e.nativeEvent; 
            this.initX = mouse.offsetX; 
            this.initY = mouse.offsetY; 

            //do thiiissss
            this.ctx.lineWidth; 

            this.ctx.beginPath();
            this.ctx.lineTo(this.initX, this.initY); 
            this.ctx.strokeStyle = "black"; 

            document.addEventListener("pointermove", this.drawMove); 
            document.addEventListener("pointerup", this.drawUp); 
        }
    }

    //when user drags 
    drawMove = (e: PointerEvent):void =>{
        //x and y mouse movement
        let x = this.initX += e.movementX, 
            y = this.initY += e.movementY; 
        //connects the point 
        this.ctx.lineTo(x, y); 
        this.ctx.stroke(); 
    }

    drawUp = (e:PointerEvent) => {
        this.ctx.closePath();  
        document.removeEventListener("pointermove", this.drawMove);
    }

    

    render() {
        return (
            <div onPointerDown = {this.drawDown}>
                <canvas ref = {this._ref} height = {this.props.Height} width = {this.props.Width}
                
                style = {{position:"absolute",
                    top: "20px", 
                    left: "0px",  
                    zIndex: 1, 
                    background: "yellow", 
                    transform: `translate(${this.props.X}px, ${this.props.Y}px)`,
                    opacity: 0.4
                }}
            
                /> 

            </div>
        );
    }
}
import "./ImageBox.scss";
import React = require("react")
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import 'react-pdf/dist/Page/AnnotationLayer.css'

interface IProps{
    Span: HTMLSpanElement;
    X: number; 
    Y: number; 
    Highlights: any[]; 

}

/**
 * Annotation class is used to take notes on a particular highlight. You can also change highlighted span's color
 * Improvements to be made: Removing the annotation when onRemove is called. (Removing this, not just the highlighted span). 
 * Also need to support multiline highlighting
 * 
 * Written by: Andrew Kim
 */
@observer
export class Annotation extends React.Component<IProps> {
    
    /**
     * changes color of the span (highlighted section)
     */
    onColorChange = (e:React.PointerEvent) => {
        if (e.currentTarget.innerHTML == "r"){
            this.props.Span.style.backgroundColor = "rgba(255,0,0, 0.3)"
        } else if (e.currentTarget.innerHTML == "b"){
            this.props.Span.style.backgroundColor = "rgba(0,255, 255, 0.3)"
        } else if (e.currentTarget.innerHTML == "y"){
            this.props.Span.style.backgroundColor = "rgba(255,255,0, 0.3)"
        } else if (e.currentTarget.innerHTML == "g"){
            this.props.Span.style.backgroundColor = "rgba(76, 175, 80, 0.3)"
        }
      
    }

    /**
     * removes the highlighted span. Supposed to remove Annotation too, but I don't know how to unmount this
     */
    @action
    onRemove = (e:any) => {
    
        if(this.props.Span.parentElement){
            let nodesArray = this.props.Span.parentElement.childNodes; 
            nodesArray.forEach((e) => {
                if (e == this.props.Span){
                    if (this.props.Span.parentElement){   
                        this.props.Highlights.forEach((item) => {
                            if (item == e){
                                item.remove(); 
                            }
                        })
                        e.remove();                   
                       
                        
                        
                    }
                }
            }) 
        }
    }

    render() {
        return (
            <div 
            style = {{
            position: "absolute",
            top: "20px", 
            left: "0px",  
            zIndex: 1, 
            transform: `translate(${this.props.X}px, ${this.props.Y}px)`,
            
            }}>
                <div style = {{width:"200px", height:"50px"}}>
                    <button
                    style = {{borderRadius: "25px", width:"25%", height:"100%"}}
                    onClick = {this.onRemove}
                    >x</button>
                    <div style = {{width:"75%", height: "100%" , display:"inline-block"}}>
                        <button onPointerDown = {this.onColorChange} style = {{backgroundColor:"red", borderRadius:"50%", color: "transparent"}}>r</button>
                        <button onPointerDown = {this.onColorChange} style = {{backgroundColor:"blue", borderRadius:"50%", color: "transparent"}}>b</button>
                        <button onPointerDown = {this.onColorChange} style = {{backgroundColor:"yellow", borderRadius:"50%", color:"transparent"}}>y</button>
                        <button onPointerDown = {this.onColorChange} style = {{backgroundColor:"green", borderRadius:"50%", color:"transparent"}}>g</button>
                    </div>
                    
                </div>
                <div  style = {{width:"200px", height:"200"}}>
                    <textarea style = {{width: "100%", height: "100%"}}
                    defaultValue = "Enter Text Here..."
                   
                    ></textarea>
                </div>
            </div>
          
        );
    }
}
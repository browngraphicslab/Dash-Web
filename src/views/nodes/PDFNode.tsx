import 'react-image-lightbox/style.css'; 
import "./ImageBox.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import 'react-pdf/dist/Page/AnnotationLayer.css'
//@ts-ignore
import { Document, Page, PDFPageProxy, PageAnnotation} from "react-pdf";
import { Utils } from '../../Utils';
import { Sticky } from './Sticky'; //you should look at sticky and annotation, because they are used here
import { Annotation } from './Annotation';

/** ALSO LOOK AT: Annotation.tsx, Sticky.tsx
 * 
 * Ok, so I know I built PDFNode on a ImageBox, but this method works... maybe make a duplicate
 * and call it PDFNode. 
 * This method renders PDF and puts all kinds of functionalities such as annotation, highlighting, 
 * area selection (I call it stickies), embedded ink node for directly annotating using a pen or 
 * mouse, and pagination. 
 * 
 * Clearly, everything works perfectly. No bugs. Might as well publish it.
 * 
 * ps watch out for some bugs. When highlighting, just highlight a section of one line... do not multiline highlight... plz
 * 
 * 
 * 
 * 
 * 
 * HOW TO USE: 
 * AREA selection: 
 *          1) Click on Area button. 
 *          2) click on any part of the PDF, and drag to get desired sized area shape
 *          3) You can write on the area (hence the reason why it's called sticky)
 *          4) to make another area, you need to click on area button AGAIN. 
 * 
 * HIGHLIGHT: (Buggy. No multiline/multidiv text highlighting for now...)
 *          1) just click and drag on a text
 *          2) click highlight
 *          3) for annotation, just pull your cursor over to that text
 *          4) another method: click on highlight first and then drag on your desired text
 *          5) To make another highlight, you need to reclick on the button 
 * 
 * Draw:
 *          1) click draw and select color. then just draw like there's no tomorrow.
 *          2) once you finish drawing your masterpiece, just reclick on the draw button to end your drawing session. 
 * 
 * Pagination:
 *          1) click on arrows. You'll notice that stickies will stay in those page. But... highlights won't. 
 *          2) to test this out, make few area/stickies and then click on next page then come back. You'll see that they are all saved. 
 *
 * 
 * written by: Andrew Kim 
 */
@observer
export class PDFNode extends React.Component<FieldViewProps> {
    
    private _mainDiv = React.createRef<HTMLDivElement>()
    private _pdf = React.createRef<HTMLCanvasElement>();
    
    //very useful for keeping track of X and y position throughout the PDF Canvas
    private initX:number = 0; 
    private initY:number = 0; 

    //checks if tool is on
    private _toolOn:boolean = false; //checks if tool is on
    private _pdfContext:any = null; //gets pdf context
    private bool:Boolean = false; //general boolean debounce
    private currSpan:any;//keeps track of current span (for highlighting)
   
    private _currTool: any; //keeps track of current tool button reference
    private _drawToolOn:boolean = false; //boolean that keeps track of the drawing tool 
    private _drawTool = React.createRef<HTMLButtonElement>()//drawing tool button reference
    
    private _colorTool = React.createRef<HTMLButtonElement>(); //color button reference
    private _currColor:string = "black"; //current color that user selected (for ink/pen)
     
    private _highlightTool = React.createRef<HTMLButtonElement>(); //highlighter button reference
    private _highlightToolOn:boolean = false; 

    @observable private stickies:any[] = [] //for storing CURRENT stickies
    @observable private page:number = 1; //default is the first page. 
    @observable private numPage:number = 1; //default number of pages
    @observable private stickiesPerPage: any = null; //for indexing stickies for EVERY PAGE
    @observable private annotations:any[] = []; //keeps track of annotations

    /**
     * for pagination backwards
     */
    @action
    onPageBack = () => {
        if (this.page > 1){
            this.page -= 1; 
            this.stickiesPerPage[this.page] = this.stickies; //stores previous sticky and indexes to stickiesPerPage
            this.stickies = []; //sets stickies to null array
            if (this.stickies){//checks stickies is null or not
                this.stickies = this.stickiesPerPage[this.page - 1]; //pulls up stickies for this page
            }
            
        }
    }

    /**
     * for pagination forwards
     */
    @action
    onPageForward = () => {
        if (this.page < this.numPage){
            this.page += 1; 
            this.stickiesPerPage[this.page - 2] = this.stickies; //stores previous sticky and indexes to stickiesPerPage
            this.stickies = []; //sets stickies to null array
            if (this.stickiesPerPage[this.page - 1]){ 
                   this.stickies = this.stickiesPerPage[this.page - 1];  //pulls up sticky for this page
            }
        }
    }
   
    /**
     * selection tool used for area highlighting (stickies). Kinda temporary
     */
    selectionTool = () => {
        this._toolOn = true; 
    }
    /**
     * when user draws on the canvas. When mouse pointer is down 
     */
    drawDown = (e:PointerEvent) => {
            this.initX = e.offsetX; 
            this.initY = e.offsetY; 
            this._pdfContext.beginPath();
            this._pdfContext.lineTo(this.initX, this.initY); 
            this._pdfContext.strokeStyle = this._currColor; 
            document.addEventListener("pointermove", this.drawMove); 
            document.addEventListener("pointerup", this.drawUp); 
        
    }

    //when user drags 
    drawMove = (e: PointerEvent):void =>{
        //x and y mouse movement
        let x = this.initX += e.movementX, 
            y = this.initY += e.movementY; 
        //connects the point 
        this._pdfContext.lineTo(x, y); 
        this._pdfContext.stroke(); 
    }

    drawUp = (e:PointerEvent) => {
        this._pdfContext.closePath();  
        document.removeEventListener("pointermove", this.drawMove);
        document.removeEventListener("pointerdown", this.drawDown);
        document.addEventListener("pointerdown", this.drawDown); 
    }

    
    /**
     * highlighting helper function
     */
    makeEditableAndHighlight = (colour:string) => {
        var range, sel = window.getSelection();
        if (sel.rangeCount && sel.getRangeAt) {
            range = sel.getRangeAt(0);
        }
        document.designMode = "on";
        if (!document.execCommand("HiliteColor", false, colour)) {
            document.execCommand("HiliteColor", false, colour);
        }
        
        if (range) {
            sel.removeAllRanges();
            sel.addRange(range);
            let element = range.commonAncestorContainer.parentElement
            if (element){
                let childNodes = element.childNodes; 
                childNodes.forEach((e) => {
                    if (e.nodeName == "SPAN"){ 
                        let span = e; 
                        span.addEventListener("mouseover", this.onEnter); 
                    }
                })
            }
        }
        document.designMode = "off";
    }
    
    /**
     * when the cursor enters the highlight, it pops out annotation. ONLY WORKS FOR SINGLE DIV LINES
     */
    @action
    onEnter = (e:any) => {
        let span:HTMLSpanElement = e.toElement;
        this.currSpan = span;  
        if (e.toElement instanceof HTMLSpanElement){   
            this.bool = true; 
            this.currSpan = span; 
            if(span.children.length == 0){ //this is why it only works for one div text lines... needs fix
               if(span.offsetParent){
                   let div = span.offsetParent;  
                   //@ts-ignore
                   let divX = div.style.left  
                   //@ts-ignore
                   let divY = div.style.top
                   //slicing "px" from the end
                   divX = divX.slice(0, divX.length - 2); //gets X of the DIV element (parent of Span)
                   divY = divY.slice(0, divY.length - 2); //gets Y of the DIV element (parent of Span)
                   let annotation = <Annotation key ={Utils.GenerateGuid()} Span = {this.currSpan} X = {divX} Y = {divY - 300} />
                   this.annotations.push(annotation); 
               } 
            }
        }
    }

    /**
     * highlight function for highlighting actual text. This works fine. 
     */
    highlight = (color:string) => {
        if (window.getSelection()) {
            try {
                if (!document.execCommand("hiliteColor", false, color)) {
                    this.makeEditableAndHighlight(color);
                }
                //when the color is not the highlight color
            } catch (ex) {
                this.makeEditableAndHighlight(color)
            }
        } 
    }

    /**
     * controls the area highlighting (stickies) Kinda temporary
     */
    onPointerDown = (e: React.PointerEvent) => {    
        if (this._toolOn){
            let mouse = e.nativeEvent; 
            this.initX = mouse.offsetX; 
            this.initY = mouse.offsetY; 
            
        }
    }

    /**
     * controls area highlighting and partially highlighting. Kinda temporary
     */
    @action
    onPointerUp = (e:React.PointerEvent) => {
      if (this._highlightToolOn){
           this.highlight("rgba(76, 175, 80, 0.3)"); //highlights to this default color. 
           this._highlightToolOn = false; 
       }
        if (this._toolOn){
            let mouse = e.nativeEvent; 
            let finalX = mouse.offsetX; 
            let finalY = mouse.offsetY;
            let width = Math.abs(finalX - this.initX); //width
            let height = Math.abs(finalY - this.initY); //height
        
            //these two if statements are bidirectional dragging. You can drag from any point to another point and generate sticky
            if (finalX < this.initX){
                this.initX = finalX; 
            }
            if (finalY < this.initY){
                this.initY = finalY; 
            }

            if (this._mainDiv.current){
                let sticky = <Sticky key ={Utils.GenerateGuid()} Height = {height} Width = {width} X = {this.initX} Y = {this.initY}/>
                this.stickies.push(sticky);   
            } 
            this._toolOn = false; 
        }
        
    }
   
    /**
     * starts drawing the line when user presses down. 
     */
    onDraw = () => {
        if (this._currTool != null){
            this._currTool.style.backgroundColor = "grey";
        }
        this._highlightToolOn = false; 
        if (this._drawTool.current){
            this._currTool = this._drawTool.current; 
            if (this._drawToolOn){
                this._drawToolOn = false; 
                document.removeEventListener("pointerdown", this.drawDown);
                document.removeEventListener("pointerup", this.drawUp);
                document.removeEventListener("pointermove", this.drawMove);
                this._drawTool.current.style.backgroundColor = "grey";
            } else {
                this._drawToolOn = true; 
                document.addEventListener("pointerdown", this.drawDown);
                this._drawTool.current.style.backgroundColor = "cyan";
            }
        }
    }

   
    /**
     * for changing color (for ink/pen)
     */
    onColorChange = (e:React.PointerEvent) => {
        if (e.currentTarget.innerHTML == "Red"){
            this._currColor = "red"; 
        } else if (e.currentTarget.innerHTML == "Blue"){
            this._currColor = "blue"; 
        } else if (e.currentTarget.innerHTML == "Green"){
            this._currColor = "green"; 
        } else if (e.currentTarget.innerHTML == "Black"){
            this._currColor = "black"; 
        }
      
    }

   
    /**
     * For highlighting (text drag highlighting)
     */
    onHighlight = () => {
        this._drawToolOn = false; 
        if (this._currTool != null){
            this._currTool.style.backgroundColor = "grey";
        }
            if (this._highlightTool.current){
                this._currTool = this._drawTool.current;
                if (this._highlightToolOn){
                    this._highlightToolOn = false; 
                    this._highlightTool.current.style.backgroundColor = "grey";
                } else {
                    this._highlightToolOn = true; 
                    this.highlight("rgba(76, 175, 80, 0.3)"); 
                    this._highlightTool.current.style.backgroundColor = "orange";
                }
        }
    }


    /**
     * renders whole lot of shets, including pdf, stickies, and annotations. 
     */

    render() {
        return (
            <div ref = {this._mainDiv}
            onPointerDown ={this.onPointerDown}
            onPointerUp = {this.onPointerUp}
            >
                {this.stickies.filter( () => { //for loading stickies (area)
                        return this.stickies[this.stickies.length - 1]
                    }).map( (element: any) => {
                        return element
                    }) 
                }     
                {this.annotations.filter( () => { //for loading annotations
                        return this.annotations[this.annotations.length - 1]
                    }).map( (element: any) => {
                        return element
                    }) 
                }                    
               
                <button onClick = {this.onPageBack}>{"<"}</button>
                <button onClick = {this.onPageForward}>{">"}</button>
                <button onClick ={this.selectionTool}>{"Area"}</button>
                <button style ={{color: "white", backgroundColor: "grey"}} onClick = {this.onHighlight} ref = {this._highlightTool}>Highlight</button>
                <button style ={{color: "white", backgroundColor: "grey"}} ref = {this._drawTool} onClick = {this.onDraw}>{"Draw"}</button>
                <button ref = {this._colorTool} onPointerDown = {this.onColorChange}>{"Red"}</button>
                <button ref = {this._colorTool} onPointerDown = {this.onColorChange}>{"Blue"}</button>
                <button ref = {this._colorTool} onPointerDown = {this.onColorChange}>{"Green"}</button>
                <button ref = {this._colorTool} onPointerDown = {this.onColorChange}>{"Black"}</button>
            
                <Document  file={Utils.pdf_example}>
                    <Page
                        pageNumber={this.page}
                        onLoadSuccess={
                            (page:any) => {
                                if (this._mainDiv.current){
                                    this._mainDiv.current.childNodes.forEach((element) => {
                                        if (element.nodeName == "DIV"){
                                            element.childNodes[0].childNodes.forEach((e) => {
                                               if (e.nodeName == "CANVAS"){
                                                   //@ts-ignore
                                                   this._pdfContext = e.getContext("2d")
                                               }
                                            })
                                        }
                                    })
                                }
                                this.numPage = page.transport.numPages
                                if (this.stickiesPerPage == null){ //only runs once, when stickiesPerPage is null
                                    this.stickiesPerPage = [...Array(this.numPage)].map(() => Array(1)); 
                                }
                            }
                        }
                    />  
                </Document>
            </div>
        );
    }
}
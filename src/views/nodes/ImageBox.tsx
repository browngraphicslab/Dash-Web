
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { SelectionManager } from "../../util/SelectionManager";
import "./ImageBox.scss";
import React = require("react")
import { ImageField } from '../../fields/ImageField';
import { FieldViewProps, FieldView } from './FieldView';
import { CollectionFreeFormDocumentView } from './CollectionFreeFormDocumentView';
import { FieldWaiting } from '../../fields/Field';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import 'react-pdf/dist/Page/AnnotationLayer.css'
//@ts-ignore
import { Document, Page, PDFPageProxy, PageAnnotation} from "react-pdf";
import { Utils } from '../../Utils';
import { any } from 'prop-types';
import { Sticky } from './Sticky';

@observer
export class ImageBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString("ImageBox"); }
    
    private _ref: React.RefObject<HTMLDivElement>;
    
    private _mainDiv = React.createRef<HTMLDivElement>()

    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;

    @observable
    private stickies:any[] = []

    @observable private _photoIndex: number = 0;
    @observable private _isOpen: boolean = false;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.state = {
            photoIndex: 0,
            isOpen: false,
        };
    }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

   

    @action
    onPageBack = () => {
        if (this.page > 1){
            this.page -= 1;  
            this.stickies = this.stickiesPerPage[this.page - 1];  
        }
    }

    @action
    onPageForward = () => {
        if (this.page < this.numPage){
            this.page += 1; 
            this.stickies = this.stickiesPerPage[this.page - 1];  
        }
    }

    
    @observable
    searchText:string =  ''; 

    @observable
    page:number = 1; //default is the first page. 

    @observable
    numPage:number = 1; //default number of pages

    @observable 
    stickiesPerPage: any = [...Array(this.numPage)].map(() => Array(1)); //makes 2d array for storage

    private textContent:any = null; 
    
    private initX:number = 0; 
    private initY:number = 0; 

    private _toolOn:boolean = false; 


    selectionTool = () => {
        this._toolOn = true; 
    }

    private _highlighter:boolean = false; 


    onPointerDown = (e: React.PointerEvent) => {   
  
        if (this._toolOn){
            let mouse = e.nativeEvent; 
            this.initX = mouse.offsetX; 
            this.initY = mouse.offsetY; 
        }
        if (this._highlighter){

        }
    }


     makeEditableAndHighlight = (colour:string) => {
        var range, sel = window.getSelection();
        if (sel.rangeCount && sel.getRangeAt) {
            range = sel.getRangeAt(0);
        }
        document.designMode = "on";
        if (range) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        if (!document.execCommand("HiliteColor", false, colour)) {
            document.execCommand("HIliteColor", false, colour);
        }
        document.designMode = "off";
    }
    

    highlight = (colour:string) => {
        var range, sel;
        if (window.getSelection()) {
            try {
                console.log(document.getSelection())

                
                if (!document.execCommand("HiliteColor", false, colour)) {
                    this.makeEditableAndHighlight(colour);
                } else if (document.execCommand("HiliteColor", false, "rgba(76, 175, 80, 0.3)")) {
                    this.makeEditableAndHighlight("black"); 
                }
            } catch (ex) {
                this.makeEditableAndHighlight(colour)
            }
        
        } 
    }

    @action
    onPointerUp = (e:React.PointerEvent) => {
        this.highlight("rgba(76, 175, 80, 0.3)"); 
       
        if (this._toolOn){
           
            let mouse = e.nativeEvent; 
            let finalX = mouse.offsetX; 
            let finalY = mouse.offsetY;
            let width = Math.abs(finalX - this.initX); 
            let height = Math.abs(finalY - this.initY); 
            
            if (this._mainDiv.current){
                let sticky = <Sticky key ={Utils.GenerateGuid()}Height = {height} Width = {width} X = {this.initX} Y = {this.initY}/>
                this.stickies.push(sticky); 
                //this.stickiesPerPage[this.page - 1].push(sticky); 
            } 

            this._toolOn = false; 
        }
        
    }


    displaySticky = () => {
        try{
            this.stickies.filter( () => {
                            return this.stickies[this.stickies.length - 1]
                        }).map( (element: any) => {
                            return element
            })
        } catch (ex) {
            console.log(ex); //should be null
        }
    }
    render() {
        return (
            <div ref = {this._mainDiv}
            onPointerDown ={this.onPointerDown}
            onPointerUp = {this.onPointerUp}
            >
                { this.stickies.filter( () => {
                        return this.stickies[this.stickies.length - 1]
                    }).map( (element: any) => {
                        return element
                    }) 
                }
                    
                    
                    
                }
                }
            
                
                <button onClick = {this.onPageBack}>{"<"}</button>
                <button onClick = {this.onPageForward}>{">"}</button>
                <button onClick ={this.selectionTool}>{"Area"}</button>
                <Document
                    file={Utils.pdf_example}

                    onLoadError={
                        (error: any) => {
                            console.log(error);
                        }
                    }
                >
                    <Page
                        pageNumber={this.page}
                      
                        onLoadSuccess={
                            (page: PDFPageProxy) => {
                                page.getTextContent().then((obj:any) => {
                                    this.textContent = obj
                                });
                                this.numPage = page.transport.numPages
                                
                            }
                        }

                        onGetAnnotationSuccess = {
                            (anno: any) => {
                                console.log(anno)
                            }
                        }

                       
                        
                    />




                </Document>


            </div>
        );
    }
}
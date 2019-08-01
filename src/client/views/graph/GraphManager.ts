

import {Graph} from "./Graph"; 
import {observable, computed} from 'mobx'; 
import { Dictionary } from "typescript-collections";
import { string } from "prop-types";
import { Doc } from "../../../new_fields/Doc";


export class GraphManager {
    @observable public Graphs: Graph[] = []; 

    @observable public GraphData: Doc =  new Doc();  

    private static _instance: GraphManager; 

    @computed
    public static get Instance():GraphManager {
        return this._instance || (this._instance = new this()); 
    }
    
    private constructor(){

    }




    public set addGraph(graph:Graph){
        this.Graphs.push(graph); 
    }

    
    defaultGraphs = ()  => {
        this.GraphData.linear = ; 
    }




  

    
    
}
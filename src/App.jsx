import './App.css'

import Home from './Components/Home'
import Mylearning from './Components/Mylearning'
import Reminder from './Components/Reminder'
import { Route,Routes,Link } from 'react-router-dom'
function App() {
  

  return (
    <>

<Routes>

  <Route path='/' element={<Home/>}/>
   <Route path='/mylearning' element={<Mylearning/>}/>
   <Route path='/reminder' element={<Reminder/>}/>
   
</Routes>


    </>
  )
}

export default App

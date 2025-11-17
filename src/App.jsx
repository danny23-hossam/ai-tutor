import './App.css'

import Home from './Components/Home'
import Mylearning from './Components/Mylearning'
import Reminder from './Components/Reminder'
import Lesson from './Components/Lesson'
import { Route,Routes,Link } from 'react-router-dom'
import Login from './Components/Authentication/Login'
function App() {
  

  return (
    <>
    <Login/>

<Routes>

  <Route path='/ssss' element={<Home/>}/>
   <Route path='/mylearning' element={<Mylearning/>}/>
   <Route path='/reminder' element={<Reminder/>}/>
   <Route path="/lesson" element={<Lesson/>}/>   
</Routes>


    </>
  )
}

export default App
